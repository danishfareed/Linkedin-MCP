import { z } from "zod";
import { type AppContext, withBrowser } from "../context.js";
import { invalidInput } from "../errors.js";
import type { Nav } from "../browser/session.js";
import { type PostContent, listScheduled, publishPost, schedulePost } from "../linkedin/pages/composer.js";
import { readMyPosts } from "../linkedin/pages/feed.js";
import { deletePost, readPostAnalytics } from "../linkedin/pages/post.js";
import { readMyProfile } from "../linkedin/pages/profile.js";
import { readProfileAnalytics } from "../linkedin/pages/lists.js";
import { postUrl } from "../linkedin/urls.js";
import { type UploadFile, assertUnchanged, validateUpload } from "../safety/files.js";
import { formatLocal } from "../util/time.js";
import { PREVIEW_NOTE, READ, WRITE_PREVIEW, defineTool } from "./registry.js";
import { defineWrite, prepareWrite } from "./write.js";

export const POST_MAX_CHARS = 3000;
const SLOT_MINUTES = 15;
const MIN_LEAD_MINUTES = 30;
const MAX_LEAD_DAYS = 90;

const postInput = {
  text: z.string().min(1).describe(`Post text, up to ${POST_MAX_CHARS} characters. Line breaks are kept.`),
  images: z.array(z.string()).max(9).optional().describe("Up to 9 absolute paths to JPG, PNG or GIF images. Cannot be combined with document."),
  document: z
    .object({
      path: z.string().describe("Absolute path to a PDF (or PPTX/DOCX) to post as a swipeable carousel."),
      title: z.string().min(1).max(100).describe("Title shown on the document."),
    })
    .optional(),
  visibility: z.enum(["anyone", "connections"]).default("anyone").describe("Who can see the post."),
};

interface PostParams {
  text: string;
  images: UploadFile[];
  document: (UploadFile & { title: string }) | null;
  visibility: "anyone" | "connections";
}

async function validatePost(ctx: AppContext, input: { text: string; images?: string[]; document?: { path: string; title: string }; visibility: "anyone" | "connections" }): Promise<PostParams> {
  const chars = [...input.text].length;
  if (chars > POST_MAX_CHARS) throw invalidInput(`The post is ${chars} characters; LinkedIn allows ${POST_MAX_CHARS}.`, { characters: chars });
  if (!input.text.trim()) throw invalidInput("The post text is empty.");
  if (input.images?.length && input.document) throw invalidInput("A post can have images or a document, not both.");
  const home = ctx.config.paths.home;
  const images = await Promise.all((input.images ?? []).map((p) => validateUpload(p, "image", home)));
  const document = input.document ? { ...(await validateUpload(input.document.path, "document", home)), title: input.document.title } : null;
  return { text: input.text, images, document, visibility: input.visibility };
}

function postPreview(p: PostParams, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    visibility: p.visibility === "anyone" ? "Anyone on or off LinkedIn" : "Connections only",
    text: p.text,
    characters: [...p.text].length,
    attachments: [
      ...p.images.map((f) => ({ type: "image", file: f.path, size_kb: Math.round(f.size_bytes / 1024) })),
      ...(p.document ? [{ type: "document", file: p.document.path, title: p.document.title, size_kb: Math.round(p.document.size_bytes / 1024) }] : []),
    ],
  };
}

async function toContent(ctx: AppContext, p: PostParams): Promise<PostContent> {
  const home = ctx.config.paths.home;
  for (const img of p.images) await assertUnchanged(img, "image", home);
  if (p.document) await assertUnchanged(p.document, "document", home);
  return {
    text: p.text,
    images: p.images.map((f) => f.path),
    document: p.document ? { path: p.document.path, title: p.document.title } : undefined,
    visibility: p.visibility,
  };
}

const publishWrite = defineWrite<PostParams>({
  kind: "create_post",
  limit: "post",
  target: () => null,
  text: (p) => p.text,
  run: async (nav, p, ctx) => publishPost(nav, await toContent(ctx, p)),
});

const scheduleWrite = defineWrite<PostParams & { publish_at: string }>({
  kind: "schedule_post",
  limit: "post",
  target: (p) => p.publish_at,
  text: (p) => p.text,
  run: async (nav, p, ctx) => {
    const when = new Date(p.publish_at);
    if (when.getTime() < ctx.clock().getTime() + 10 * 60_000) {
      throw invalidInput("The scheduled time is now too close or already past.", { publish_at: p.publish_at });
    }
    return schedulePost(nav, await toContent(ctx, p), when);
  },
});

const deleteWrite = defineWrite<{ post_url: string }>({
  kind: "delete_post",
  limit: null,
  target: (p) => p.post_url,
  text: () => null,
  run: (nav, p) => deletePost(nav, p.post_url),
});

/** Round up to LinkedIn's 15-minute scheduling slots and check the window. */
export function normaliseScheduleTime(input: string, now: Date): Date {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) throw invalidInput(`"${input}" is not a valid date/time. Use ISO 8601, e.g. 2026-12-01T09:30 (local time) or 2026-12-01T09:30:00Z.`);
  const slot = SLOT_MINUTES * 60_000;
  const rounded = new Date(Math.ceil(parsed.getTime() / slot) * slot);
  if (rounded.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) {
    throw invalidInput(`Schedule at least ${MIN_LEAD_MINUTES} minutes ahead. Use create_post to publish now.`);
  }
  if (rounded.getTime() > now.getTime() + MAX_LEAD_DAYS * 86_400_000) {
    throw invalidInput(`LinkedIn only schedules up to ${MAX_LEAD_DAYS} days ahead.`);
  }
  return rounded;
}

async function myPublicId(ctx: AppContext, nav: Nav): Promise<string> {
  const cached = (await ctx.account.get()).public_id;
  if (cached) return cached;
  const me = await readMyProfile(nav, []);
  if (!me.public_id) throw new Error("Could not determine your profile username.");
  await ctx.account.update({ name: me.name, profile_url: me.profile_url, public_id: me.public_id });
  return me.public_id;
}

export const contentTools = [
  defineTool({
    name: "create_post",
    title: "Create a LinkedIn post",
    description:
      "Prepare a LinkedIn post (text, optional images or a PDF carousel) to publish now from the user's account. Counts against the daily post limit." +
      PREVIEW_NOTE,
    input: postInput,
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const params = await validatePost(ctx, args);
      return prepareWrite(ctx, publishWrite, params, postPreview(params, { action: "Publish a post now" }));
    },
  }),

  defineTool({
    name: "schedule_post",
    title: "Schedule a LinkedIn post",
    description:
      "Prepare a post to be scheduled with LinkedIn's own scheduler, so it publishes even when this computer is off. " +
      "publish_at is ISO 8601; without a timezone it means the user's local time. Times round up to the next 15 minutes. " +
      "Allowed window: 30 minutes to 90 days ahead. Scheduled posts count against the daily post limit." +
      PREVIEW_NOTE,
    input: { ...postInput, publish_at: z.string().describe("When to publish, e.g. 2026-12-01T09:30 (local) or 2026-12-01T09:30:00Z.") },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const when = normaliseScheduleTime(args.publish_at, ctx.clock());
      const params = { ...(await validatePost(ctx, args)), publish_at: when.toISOString() };
      return prepareWrite(ctx, scheduleWrite, params, postPreview(params, { action: "Schedule a post", publish_at: formatLocal(when) }));
    },
  }),

  defineTool({
    name: "list_scheduled_posts",
    title: "List scheduled posts",
    description: "List posts waiting in LinkedIn's scheduler, with their scheduled time and text.",
    input: {},
    annotations: READ,
    handler: async (_args, ctx) => ({ scheduled_posts: await withBrowser(ctx, (nav) => listScheduled(nav)) }),
  }),

  defineTool({
    name: "delete_post",
    title: "Delete one of your posts",
    description: "Prepare deletion of one of the user's own LinkedIn posts. Deleting cannot be undone." + PREVIEW_NOTE,
    input: { post_url: z.string().describe("URL of your post, e.g. https://www.linkedin.com/feed/update/urn:li:activity:…/") },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const url = postUrl(args.post_url);
      return prepareWrite(ctx, deleteWrite, { post_url: url }, { action: "Delete this post permanently", post_url: url, warning: "This cannot be undone." });
    },
  }),

  defineTool({
    name: "get_my_posts",
    title: "Get your recent posts",
    description: "The user's own recent posts with impressions, reactions, comments and reposts where LinkedIn shows them.",
    input: { limit: z.number().int().min(1).max(20).default(10) },
    annotations: READ,
    handler: async (args, ctx) =>
      withBrowser(ctx, async (nav) => ({ posts: await readMyPosts(nav, await myPublicId(ctx, nav), args.limit) })),
  }),

  defineTool({
    name: "get_post_analytics",
    title: "Get analytics for one of your posts",
    description: "Impressions, members reached, profile views, followers gained, reactions, comments, reposts, saves, sends and top viewer demographics for one of the user's own posts.",
    input: { post_url: z.string().describe("URL of your post.") },
    annotations: READ,
    handler: async (args, ctx) => withBrowser(ctx, (nav) => readPostAnalytics(nav, args.post_url)),
  }),

  defineTool({
    name: "get_profile_analytics",
    title: "Get your profile analytics",
    description: "Post impressions, followers, profile viewers and search appearances from the user's LinkedIn dashboard, with the trend LinkedIn shows for each.",
    input: {},
    annotations: READ,
    handler: async (_args, ctx) => withBrowser(ctx, (nav) => readProfileAnalytics(nav)),
  }),
];
