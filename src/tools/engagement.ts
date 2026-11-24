import { z } from "zod";
import { withBrowser } from "../context.js";
import { invalidInput } from "../errors.js";
import { readFeedPosts, searchPosts } from "../linkedin/pages/feed.js";
import { readNotificationsResult } from "../linkedin/pages/lists.js";
import { listPayload } from "../linkedin/parse/list.js";
import { REACTIONS, comment, react, readComments, reply } from "../linkedin/pages/post.js";
import { DATE_POSTED, POST_CONTENT_TYPES, POST_SORTS, postUrl } from "../linkedin/urls.js";
import { PREVIEW_NOTE, READ, WRITE_PREVIEW, defineTool } from "./registry.js";
import { defineWrite, executeWrite, prepareWrite } from "./write.js";

export const COMMENT_MAX_CHARS = 1250;

const commentText = z.string().min(1).describe(`Comment text, up to ${COMMENT_MAX_CHARS} characters.`);

function checkComment(text: string): void {
  const n = [...text].length;
  if (!text.trim()) throw invalidInput("The comment is empty.");
  if (n > COMMENT_MAX_CHARS) throw invalidInput(`The comment is ${n} characters; LinkedIn allows ${COMMENT_MAX_CHARS}.`);
}

const reactWrite = defineWrite<{ post_url: string; reaction: (typeof REACTIONS)[number] }>({
  kind: "react_to_post",
  limit: "reaction",
  target: (p) => p.post_url,
  text: (p) => p.reaction,
  run: (nav, p) => react(nav, p.post_url, p.reaction),
});

const commentWrite = defineWrite<{ post_url: string; text: string }>({
  kind: "comment_on_post",
  limit: "comment",
  target: (p) => p.post_url,
  text: (p) => p.text,
  run: (nav, p) => comment(nav, p.post_url, p.text),
});

const replyWrite = defineWrite<{ post_url: string; comment_id: string; text: string }>({
  kind: "reply_to_comment",
  limit: "comment",
  target: (p) => `${p.post_url}#${p.comment_id}`,
  text: (p) => p.text,
  run: (nav, p) => reply(nav, p.post_url, p.comment_id, p.text),
});

export const engagementTools = [
  defineTool({
    name: "get_feed",
    title: "Read your LinkedIn feed",
    description:
      "Recent posts from the user's home feed (author, text, reactions, comments, reposts, post URL), at most 20. Promoted posts are skipped. " +
      "complete is false, with a note, when fewer posts than asked for could be loaded.",
    input: { limit: z.number().int().min(1).max(20).default(10) },
    annotations: READ,
    handler: async (args, ctx) => withBrowser(ctx, (nav) => readFeedPosts(nav, args.limit)),
  }),

  defineTool({
    name: "search_posts",
    title: "Search LinkedIn posts",
    description:
      "Search public LinkedIn posts by keywords (at most 20 results), optionally limited to the past 24 hours, week or month, sorted by relevance or latest, and filtered to posts with photos, videos or documents. " +
      "complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily search limit.",
    input: {
      keywords: z.string().min(1).max(200),
      date_posted: z.enum(DATE_POSTED).optional(),
      sort: z.enum(POST_SORTS).default("relevance").describe("relevance (LinkedIn's default) or latest (newest first)."),
      content_type: z.enum(POST_CONTENT_TYPES).optional().describe("Only posts that contain photos, videos or documents."),
      limit: z.number().int().min(1).max(20).default(10),
    },
    annotations: READ,
    handler: async (args, ctx) => {
      if (!args.keywords.trim()) throw invalidInput("Give keywords to search for.");
      await ctx.limits.assertAvailable("search");
      const opts = { datePosted: args.date_posted, sort: args.sort, contentType: args.content_type };
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("search");
        return searchPosts(nav, args.keywords.trim(), opts, args.limit);
      });
    },
  }),

  defineTool({
    name: "get_post_comments",
    title: "Read comments on a post",
    description: "Comments and replies on a LinkedIn post. Each comment has an id you can pass to reply_to_comment.",
    input: { post_url: z.string(), limit: z.number().int().min(1).max(50).default(20) },
    annotations: READ,
    handler: async (args, ctx) => {
      const url = postUrl(args.post_url);
      return { comments: await withBrowser(ctx, (nav) => readComments(nav, url, args.limit)) };
    },
  }),

  defineTool({
    name: "react_to_post",
    title: "React to a post",
    description:
      "React to a LinkedIn post (like, celebrate, support, love, insightful, funny). It never removes an existing reaction. Counts against the daily reaction limit. " +
      "By default this returns a preview and a confirmation_token; show it to the user and call confirm_action only after they approve. " +
      "If the user turned off reaction confirmations in their config, it reacts directly.",
    input: { post_url: z.string(), reaction: z.enum(REACTIONS).default("like") },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const params = { post_url: postUrl(args.post_url), reaction: args.reaction };
      if (!ctx.config.confirmReactions) return executeWrite(ctx, reactWrite.kind, params);
      return prepareWrite(ctx, reactWrite, params, { action: `React "${args.reaction}" to this post`, post_url: params.post_url });
    },
  }),

  defineTool({
    name: "comment_on_post",
    title: "Comment on a post",
    description: "Prepare a comment on a LinkedIn post. Counts against the daily comment limit." + PREVIEW_NOTE,
    input: { post_url: z.string(), text: commentText },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      checkComment(args.text);
      const params = { post_url: postUrl(args.post_url), text: args.text };
      return prepareWrite(ctx, commentWrite, params, { action: "Comment on this post", post_url: params.post_url, text: args.text, characters: [...args.text].length });
    },
  }),

  defineTool({
    name: "reply_to_comment",
    title: "Reply to a comment",
    description: "Prepare a reply to a comment on a LinkedIn post. Get comment_id from get_post_comments. Counts against the daily comment limit." + PREVIEW_NOTE,
    input: { post_url: z.string(), comment_id: z.string().min(1).describe("The comment's id from get_post_comments (urn:li:comment:…)."), text: commentText },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      checkComment(args.text);
      if (!/^urn:li:comment:/.test(args.comment_id)) throw invalidInput("comment_id must be a comment id from get_post_comments, starting with urn:li:comment:");
      const params = { post_url: postUrl(args.post_url), comment_id: args.comment_id, text: args.text };
      return prepareWrite(ctx, replyWrite, params, { action: "Reply to a comment", post_url: params.post_url, comment_id: args.comment_id, text: args.text });
    },
  }),

  defineTool({
    name: "get_notifications",
    title: "Read your notifications",
    description: "Recent LinkedIn notifications: comments, reactions, mentions, profile views and more, with links.",
    input: { limit: z.number().int().min(1).max(30).default(15) },
    annotations: READ,
    handler: async (args, ctx) => listPayload("notifications", await withBrowser(ctx, (nav) => readNotificationsResult(nav, args.limit))),
  }),
];
