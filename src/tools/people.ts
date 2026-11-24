import { z } from "zod";
import { withBrowser } from "../context.js";
import { invalidInput } from "../errors.js";
import { readCompanyPosts, readPersonPosts } from "../linkedin/pages/activity.js";
import { listInvitations, readConversation, readInbox, respondToInvitation, searchCompanies, searchPeople, sendMessage } from "../linkedin/pages/lists.js";
import { readCompany, readMyProfile, readPersonProfile, sendConnectionRequest } from "../linkedin/pages/profile.js";
import { PROFILE_SECTIONS } from "../linkedin/parse/profile.js";
import { companySlug, profileId, profileUrl, threadUrl } from "../linkedin/urls.js";
import { PREVIEW_NOTE, READ, WRITE_PREVIEW, defineTool } from "./registry.js";
import { defineWrite, prepareWrite } from "./write.js";

const NOTE_FREE_MAX = 200;
const NOTE_PREMIUM_MAX = 300;
const MESSAGE_MAX = 8000;

const POSTS_MAX = 20;

const sections = z
  .array(z.enum(PROFILE_SECTIONS))
  .default(["about", "experience", "education"])
  .describe("Which profile sections to read.");

const profileInput = z.string().describe("Profile URL or username, e.g. https://www.linkedin.com/in/jane-doe/ or jane-doe.");
const companyInput = z.string().describe("Company URL or slug, e.g. https://www.linkedin.com/company/acme/ or acme.");

const connectWrite = defineWrite<{ profile_url: string; note: string | null }>({
  kind: "send_connection_request",
  limit: "connection",
  target: (p) => p.profile_url,
  text: (p) => p.note,
  run: (nav, p) => sendConnectionRequest(nav, p.profile_url, p.note ?? undefined),
});

const invitationWrite = defineWrite<{ id: string; action: "accept" | "ignore" }>({
  kind: "respond_to_invitation",
  limit: null,
  target: (p) => p.id,
  text: (p) => p.action,
  run: (nav, p) => respondToInvitation(nav, p.id, p.action),
});

const messageWrite = defineWrite<{ target: string; text: string }>({
  kind: "send_message",
  limit: "message",
  target: (p) => p.target,
  text: (p) => p.text,
  run: (nav, p) => sendMessage(nav, p.target, p.text),
});

function conversationTarget(input: string): string {
  return threadUrl(input) ?? profileUrl(input);
}

export const researchTools = [
  defineTool({
    name: "get_person_profile",
    title: "Read a LinkedIn profile",
    description: "Read one person's LinkedIn profile: name, headline, location and the sections you ask for. Counts against the daily profile-view limit.",
    input: { profile: profileInput, sections },
    annotations: READ,
    handler: async (args, ctx) => {
      profileId(args.profile); // validate before the browser starts
      await ctx.limits.assertAvailable("profile_view");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("profile_view");
        return readPersonProfile(nav, args.profile, args.sections);
      });
    },
  }),

  defineTool({
    name: "get_person_posts",
    title: "Read a person's recent posts",
    description:
      `A person's recent LinkedIn posts and reposts, newest first, at most ${POSTS_MAX}: text, when (relative, e.g. "3d"), reaction, comment and repost counts, and each post's URL. ` +
      "kind says whether it's their own post or a repost. Their comments and reactions on other people's posts are left out. " +
      "complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily profile-view limit.",
    input: { profile: profileInput, limit: z.number().int().min(1).max(POSTS_MAX).default(10) },
    annotations: READ,
    handler: async (args, ctx) => {
      profileId(args.profile);
      await ctx.limits.assertAvailable("profile_view");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("profile_view");
        return readPersonPosts(nav, args.profile, args.limit);
      });
    },
  }),

  defineTool({
    name: "get_my_profile",
    title: "Read your own profile",
    description: "Read the signed-in user's own LinkedIn profile. Does not count as a research profile view.",
    input: { sections },
    annotations: READ,
    handler: async (args, ctx) =>
      withBrowser(ctx, async (nav) => {
        const me = await readMyProfile(nav, args.sections);
        await ctx.account.update({ name: me.name, profile_url: me.profile_url, public_id: me.public_id, last_verified_at: ctx.clock().toISOString() });
        return me;
      }),
  }),

  defineTool({
    name: "get_company_profile",
    title: "Read a company page",
    description: "Read a LinkedIn company page: overview, website, industry, size, headquarters, founding year, specialties and followers. Counts against the daily profile-view limit.",
    input: { company: companyInput },
    annotations: READ,
    handler: async (args, ctx) => {
      companySlug(args.company); // validate before the browser starts
      await ctx.limits.assertAvailable("profile_view");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("profile_view");
        return readCompany(nav, args.company);
      });
    },
  }),

  defineTool({
    name: "get_company_posts",
    title: "Read a company's recent posts",
    description:
      `A company's recent LinkedIn posts from its Posts tab, in the order LinkedIn shows them, at most ${POSTS_MAX}: text, when (relative), reaction, comment and repost counts, and each post's URL. ` +
      "complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily profile-view limit.",
    input: { company: companyInput, limit: z.number().int().min(1).max(POSTS_MAX).default(10) },
    annotations: READ,
    handler: async (args, ctx) => {
      companySlug(args.company);
      await ctx.limits.assertAvailable("profile_view");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("profile_view");
        return readCompanyPosts(nav, args.company, args.limit);
      });
    },
  }),

  defineTool({
    name: "search_people",
    title: "Search for people",
    description:
      "Search LinkedIn for people. Returns at most 10 results (name, headline, location, profile URL, connection degree): one page, for finding a specific person, not for building lists. Counts against the daily search limit.",
    input: {
      keywords: z.string().max(200).default(""),
      filters: z
        .object({
          network: z.array(z.enum(["1st", "2nd", "3rd+"])).optional(),
          title: z.string().max(100).optional(),
          company: z.string().max(100).optional(),
          first_name: z.string().max(60).optional(),
          last_name: z.string().max(60).optional(),
          school: z.string().max(100).optional(),
        })
        .default({}),
      limit: z.number().int().min(1).max(10).default(10),
    },
    annotations: READ,
    handler: async (args, ctx) => {
      if (!args.keywords.trim() && !Object.values(args.filters).some((v) => (Array.isArray(v) ? v.length : v))) {
        throw invalidInput("Give keywords or at least one filter.");
      }
      await ctx.limits.assertAvailable("search");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("search");
        return { people: await searchPeople(nav, args.keywords, args.filters, args.limit) };
      });
    },
  }),

  defineTool({
    name: "search_companies",
    title: "Search for companies",
    description: "Search LinkedIn for companies by keywords. Returns at most 10 results. Counts against the daily search limit.",
    input: { keywords: z.string().min(1).max(200), limit: z.number().int().min(1).max(10).default(10) },
    annotations: READ,
    handler: async (args, ctx) => {
      if (!args.keywords.trim()) throw invalidInput("Give keywords to search for.");
      await ctx.limits.assertAvailable("search");
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("search");
        return { companies: await searchCompanies(nav, args.keywords, args.limit) };
      });
    },
  }),
];

export const networkTools = [
  defineTool({
    name: "send_connection_request",
    title: "Send a connection request",
    description:
      `Prepare a connection request, optionally with a note (up to ${NOTE_FREE_MAX} characters, or ${NOTE_PREMIUM_MAX} with Premium). Counts against the daily connection limit.` +
      PREVIEW_NOTE,
    input: {
      profile: z.string().describe("Profile URL or username."),
      note: z.string().max(NOTE_PREMIUM_MAX).optional(),
    },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const url = profileUrl(args.profile);
      const note = args.note?.trim() ? args.note.trim() : null;
      const chars = note ? [...note].length : 0;
      const preview: Record<string, unknown> = { action: "Send a connection request", profile_url: url, note: note ?? "(no note)" };
      if (chars > NOTE_FREE_MAX) preview.warning = `The note is ${chars} characters. Notes over ${NOTE_FREE_MAX} need LinkedIn Premium; without it the request will fail.`;
      return prepareWrite(ctx, connectWrite, { profile_url: url, note }, preview);
    },
  }),

  defineTool({
    name: "list_invitations",
    title: "List connection invitations",
    description: "Pending connection invitations you've received or sent. Each received invitation has an id for respond_to_invitation.",
    input: { direction: z.enum(["received", "sent"]).default("received"), limit: z.number().int().min(1).max(50).default(20) },
    annotations: READ,
    handler: async (args, ctx) => ({ invitations: await withBrowser(ctx, (nav) => listInvitations(nav, args.direction, args.limit)) }),
  }),

  defineTool({
    name: "respond_to_invitation",
    title: "Accept or ignore an invitation",
    description: "Prepare accepting or ignoring a received connection invitation. Get the id from list_invitations." + PREVIEW_NOTE,
    input: { id: z.string().min(1).describe("Invitation id (the inviter's username) from list_invitations."), action: z.enum(["accept", "ignore"]) },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      const id = profileId(args.id);
      return prepareWrite(ctx, invitationWrite, { id, action: args.action }, { action: `${args.action === "accept" ? "Accept" : "Ignore"} the invitation from ${id}`, profile_url: profileUrl(id) });
    },
  }),
];

export const messagingTools = [
  defineTool({
    name: "get_inbox",
    title: "Read your LinkedIn inbox",
    description: "Recent conversations: who, the last message, when, whether unread, and the thread URL.",
    input: { limit: z.number().int().min(1).max(20).default(10) },
    annotations: READ,
    handler: async (args, ctx) => ({ conversations: await withBrowser(ctx, (nav) => readInbox(nav, args.limit)) }),
  }),

  defineTool({
    name: "get_conversation",
    title: "Read a conversation",
    description:
      "Messages in one conversation, oldest first. Pass a thread URL from get_inbox, or a connection's profile URL or username. " +
      "Opening a thread marks it as read on LinkedIn, and the other person may see a read receipt.",
    input: { thread_or_profile: z.string(), limit: z.number().int().min(1).max(50).default(20) },
    annotations: READ,
    handler: async (args, ctx) => {
      const target = conversationTarget(args.thread_or_profile);
      return { messages: await withBrowser(ctx, (nav) => readConversation(nav, target, args.limit)) };
    },
  }),

  defineTool({
    name: "send_message",
    title: "Send a message",
    description:
      "Prepare a LinkedIn message to an existing conversation (thread URL) or a connection (profile URL or username). Counts against the daily message limit." + PREVIEW_NOTE,
    input: { profile_or_thread: z.string(), text: z.string().min(1).max(MESSAGE_MAX) },
    annotations: WRITE_PREVIEW,
    handler: async (args, ctx) => {
      if (!args.text.trim()) throw invalidInput("The message is empty.");
      const target = conversationTarget(args.profile_or_thread);
      return prepareWrite(ctx, messageWrite, { target, text: args.text }, { action: "Send a message", to: target, text: args.text });
    },
  }),
];
