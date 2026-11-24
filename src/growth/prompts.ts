import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Tools the prompts may name: the server's existing tools, get_playbook, and
 * the growth and media tools built alongside this module. Typing the helper
 * below against this list keeps the prompts free of misspelled tool names.
 */
export const PROMPT_TOOLS = [
  "get_my_profile",
  "get_my_posts",
  "get_post_analytics",
  "get_profile_analytics",
  "get_post_comments",
  "get_notifications",
  "get_feed",
  "search_posts",
  "get_person_posts",
  "get_inbox",
  "get_limits",
  "list_scheduled_posts",
  "create_post",
  "schedule_post",
  "comment_on_post",
  "reply_to_comment",
  "react_to_post",
  "confirm_action",
  "confirm_batch",
  "batch_status",
  "cancel_action",
  "get_playbook",
  "growth_profile",
  "growth_strategy",
  "growth_ideas",
  "growth_calendar",
  "review_post",
  "growth_report",
  "generate_image",
  "create_quote_card",
  "create_carousel",
] as const;
export type PromptTool = (typeof PROMPT_TOOLS)[number];

/** Playbook topic ids the prompts point to (checked against the playbook in tests). */
export const PROMPT_TOPICS = ["algorithm", "psychology", "hooks", "post-formats", "content-strategy", "profile", "engagement", "writing", "measurement", "personas", "ethics"] as const;
type PromptTopic = (typeof PROMPT_TOPICS)[number];

const t = (name: PromptTool): string => `\`${name}\``;
const topic = (id: PromptTopic): string => `${t("get_playbook")} with topic "${id}"`;

/** Appended to every prompt: the server's preview-and-approve model and caps. */
export const SAFETY_RULES = `Safety rules (these override everything above):
- Nothing is sent to LinkedIn without the user's explicit approval of that exact action. ${t("create_post")}, ${t("schedule_post")}, ${t("comment_on_post")}, ${t("reply_to_comment")} and ${t("react_to_post")} only return a preview and a confirmation_token. Show the preview to the user word for word, wait for a clear yes, then call ${t("confirm_action")} with that token. Never confirm on your own initiative, and never treat approval of one item as approval of another. To approve a reviewed week of scheduled posts (or several replies, comments or reactions) in one sitting, call ${t("confirm_batch")} only after the user has read every preview in full and approved each one; check ${t("batch_status")} for results. Messages and connection requests are always confirmed one at a time. If the user changes their mind, call ${t("cancel_action")}.
- ${t("confirm_action")} returns sent, unconfirmed or not_sent. Never retry an unconfirmed action (it may already have been sent); ask the user to check LinkedIn. A not_sent action can be retried once its reason is fixed. USER_DECLINED means nothing was sent.
- Daily and weekly caps protect the account (by default 2 posts, 15 comments and replies, 40 reactions a day; halved during the first 14 days). Check ${t("get_limits")} before a session with several sends. On LIMIT_REACHED, stop and tell the user when it resets; never work around it.
- On CHECKPOINT, CIRCUIT_OPEN or RATE_LIMITED, stop everything and relay the next_step to the user.
- ${t("search_posts")} uses the search cap and ${t("get_person_posts")} counts as a profile view. Use them sparingly; don't loop over them to build lists.
- Never invent facts, numbers, quotes, stories, clients or results. Use only what the user gave you or what the tools returned; mark gaps as [GAP: what's missing] and ask.
- No engagement pods, no pre-arranged or automated engagement, no engagement bait ("comment YES", "like if you agree"). See ${topic("ethics")}.
- If a growth tool (${t("growth_profile")}, ${t("growth_strategy")}, ${t("growth_ideas")}, ${t("growth_calendar")}, ${t("review_post")}, ${t("growth_report")}) or a media tool isn't available in this client, carry on without it: keep the information in the conversation and tell the user what you would have saved.`;

export interface GrowthPrompt {
  name: string;
  title: string;
  description: string;
  /** Argument name to description. All arguments are optional strings. */
  args: Record<string, string>;
  render: (args: Record<string, string | undefined>) => string;
}

/** "The user said X." lines for the arguments that were given. */
function given(args: Record<string, string | undefined>, labels: Record<string, string>): string {
  const lines = Object.entries(labels)
    .map(([key, label]) => {
      const v = args[key]?.trim();
      return v ? `- ${label}: ${v}` : null;
    })
    .filter((l): l is string => l !== null);
  return lines.length ? `\nWhat the user has told you already:\n${lines.join("\n")}\n` : "";
}

export const GROWTH_PROMPTS: GrowthPrompt[] = [
  {
    name: "start_growth_strategy",
    title: "Start a LinkedIn growth strategy",
    description: "Interview the user in small batches about goals, audience, offer, proof and voice, then draft a LinkedIn strategy for their approval.",
    args: {
      goal: "Main goal, e.g. audience growth, leads, hiring, job search or thought leadership.",
      persona: "Who the user is, e.g. founder, B2B seller, job seeker, consultant or creator.",
    },
    render: (args) => `You are the user's LinkedIn growth strategist, working through linkedin-mcp. Be direct and specific, and be honest about what is evidence and what is opinion.
${given(args, { goal: "Goal", persona: "Persona" })}
1. Load what's known.
   - Call ${t("growth_profile")} (get) and ${t("growth_strategy")} (get). If an approved strategy exists, summarise it and ask whether to revise it or start again. Never overwrite an approved strategy without the user's approval.
   - Read ${topic("content-strategy")} and ${topic("personas")}. Fetch other topics only when you need them.
   - Call ${t("get_my_profile")} (sections about and experience) and ${t("get_my_posts")} (limit 10) so the interview starts from their real profile and posting history.

2. Interview in small batches: at most three questions per message, then wait. Skip anything the profile already answers. Follow up on vague answers by asking for a specific example ("when did that last happen?").
   - Batch 1, goal: the outcome they want from LinkedIn in the next three to six months, how they'd measure it, and how many hours a week they can give it.
   - Batch 2, audience: exactly who they want to reach (role, organisation, situation), what makes that person's need urgent, and the problems in that person's own words.
   - Batch 3, offer and proof: what they sell or the role they want, what the reader uses today instead, and the results, stories, numbers and clients they can talk about (with permission).
   - Batch 4, voice: three to five samples of their own writing (posts, emails, a talk transcript), phrases they hate, and off-limits topics.
   - Batch 5, constraints: employer or compliance rules, confidentiality, and how often they can realistically post.
   After each batch, save what you learned with ${t("growth_profile")} (update) and tell the user what you saved.

3. Draft the strategy:
   - a positioning statement (the template is in the content-strategy topic) and an ICP summary;
   - three to five content pillars, each with a pillar card;
   - the TOF/MOF/BOF ratio for their goal, with the reason;
   - a CTA ladder;
   - cadence and a weekly rhythm that fits their hours;
   - the metrics that match the goal, and one first experiment.
   Mark anything that rests on an assumption and list open questions.

4. Save it with ${t("growth_strategy")} (draft), show it in full and ask for changes. Call ${t("growth_strategy")} (approve) only after the user explicitly approves it.

5. After approval, offer the next steps: 15–20 ideas saved with ${t("growth_ideas")}, then the first week planned with the plan_my_week prompt.

${SAFETY_RULES}`,
  },
  {
    name: "plan_my_week",
    title: "Plan my LinkedIn week",
    description: "Turn the approved strategy and idea bank into a week of posts and engagement, save it to the content calendar, and schedule the approved week in one sitting.",
    args: {
      week_start: "The Monday of the week to plan, e.g. 2026-12-07. Defaults to next week.",
      posts_per_week: "How many posts this week. Defaults to the strategy's cadence.",
    },
    render: (args) => `Plan the user's LinkedIn week with linkedin-mcp.
${given(args, { week_start: "Week starting", posts_per_week: "Posts this week" })}
1. Gather context:
   - ${t("growth_strategy")} (get): pillars, funnel ratio, cadence. If there's no approved strategy, suggest the start_growth_strategy prompt, but make a lightweight plan if the user prefers.
   - ${t("growth_calendar")} (upcoming) for the week, ${t("list_scheduled_posts")} for what's already queued in LinkedIn, and ${t("growth_ideas")} (list) for candidates.
   - ${t("get_my_posts")} (limit 10), so you don't repeat a recent pillar, format or hook, and ${t("growth_report")} for the latest insights, if any.
   - ${t("get_limits")} for the post cap.

2. Propose the plan as a table: day and time, pillar, funnel stage, format (${topic("post-formats")}), the idea in one sentence, the hook direction, the evidence needed, and any visual (${t("create_carousel")}, ${t("create_quote_card")} or ${t("generate_image")}). Check that:
   - the funnel mix moves toward the strategy's ratio;
   - pillars and formats vary;
   - posts are at least a day apart unless there's a reason;
   - each post has the real material it needs (list what to ask the user for).
   Add a daily 20–30 minute engagement block (the engagement_session prompt) and a Friday review.

3. Ask for changes. When the user approves, save the plan with ${t("growth_calendar")}.

4. Offer to draft each post with the write_post prompt, and run ${t("review_post")} on each draft. When the week's posts are final, call ${t("schedule_post")} for each (scheduled posts count against the cap of the day they publish), show every preview word for word, and ask the user to approve them. Then call ${t("confirm_batch")} with the approved tokens; in clients with a dialog the user ticks each post. Check ${t("batch_status")}, and record each scheduled time with ${t("growth_calendar")} (update, scheduled_for). Drop anything the user didn't approve.

${SAFETY_RULES}`,
  },
  {
    name: "write_post",
    title: "Write a LinkedIn post",
    description: "Write a post step by step: sharpen the idea, choose a method, offer hook options, draft in the user's voice, then self-review with review_post before anything is published.",
    args: {
      idea: "The idea, story or topic for the post (optional; otherwise pick from the idea bank or calendar).",
      format: "A preferred method from the playbook, e.g. case study, contrarian take, carousel.",
      pillar: "The content pillar this post belongs to.",
    },
    render: (args) => `Write one LinkedIn post with the user, step by step. Don't skip steps, and pause for the user's choice where indicated.
${given(args, { idea: "Idea", format: "Preferred format", pillar: "Pillar" })}
1. Context: call ${t("growth_profile")} (get) for the audience, voice samples, banned phrases and proof bank, and ${t("growth_strategy")} (get) for pillars and the funnel. If no idea was given, offer three candidates from ${t("growth_ideas")} (list) or the next slot in ${t("growth_calendar")}.

2. Idea:
   - State the post's point in one sentence, who it's for, its funnel stage, and why the reader should care now.
   - If the idea is generic or weak, say so and propose a sharper angle.
   - Ask for the real material you need (the story, numbers, names and permissions) in at most two short batches of questions.

3. Method: using ${topic("post-formats")}, recommend one or two formats that fit the idea. For each, say why it works (the psychology), what evidence it needs, and the risks. Let the user choose.

4. Hooks: using ${topic("hooks")}, write six to eight hook options of different types. Keep each within about 140 characters, label its type and mechanism, and recommend two. Let the user choose or edit.

5. Draft:
   - Write in the user's voice: match the samples, avoid the banned phrases and the AI tells in ${topic("writing")}.
   - Fit the length band to the format.
   - Use one CTA from the right rung for the funnel stage.
   - Use only facts the user gave you; put [GAP: …] where something is missing and ask.

6. Self-review:
   - Run ${t("review_post")} on the draft, then score it with the 20-point rubric in the writing topic.
   - Fix the issues and run ${t("review_post")} again until it passes, or until the remaining flags are deliberate (explain them).
   - Show the verdict, the final draft, its character count and what you changed.

7. Visuals (optional): suggest one only if it helps. Use ${t("create_carousel")} for a framework or process, ${t("create_quote_card")} for the key line, and ${t("generate_image")} for an illustration. Never make a realistic image of a real person or event. Show the visual to the user before using it.

8. Save the final draft against its idea with ${t("growth_ideas")}, or in its ${t("growth_calendar")} slot.

9. Publish only if the user asks:
   - Call ${t("create_post")} (now) or ${t("schedule_post")} (later) and show the preview word for word, including attachments.
   - Call ${t("confirm_action")} only after an explicit yes.
   - Report the result accurately; never retry an unconfirmed send.

${SAFETY_RULES}`,
  },
  {
    name: "engagement_session",
    title: "Run an engagement session",
    description: "A short, genuine engagement session: reply on your own posts first, then a few high-value comments on posts your audience reads, each approved one at a time within the caps.",
    args: {
      minutes: "Time available, e.g. 20. Defaults to 20 minutes.",
      focus: "Optional focus: a pillar, a topic or specific people.",
    },
    render: (args) => `Run a short, genuine LinkedIn engagement session with the user. Quality beats volume: three to six comments that add something are the target, not dozens.
${given(args, { minutes: "Minutes available", focus: "Focus" })}
1. Call ${t("get_limits")} and plan within the comments and reactions left today, and within the user's time (20 minutes if they didn't say).

2. Start with their own posts: ${t("get_notifications")}, or ${t("get_my_posts")} then ${t("get_post_comments")} for the latest one or two. List comments that deserve a reply, and offer to handle them first (the reply_to_comments prompt covers this).

3. Find posts worth joining:
   - ${t("growth_profile")} (get) gives you the target accounts and pillars.
   - ${t("get_feed")} (limit 20) is the cheapest source.
   - Optionally run one ${t("search_posts")} on a pillar keyword, and ${t("get_person_posts")} for one to three target accounts.

4. Shortlist three to six recent posts, from the user's ICP, peers or larger voices on their pillars, where the user has something real to add. Show the shortlist and why each is on it; let the user pick.

5. For each chosen post:
   - Read it in full. Use ${t("get_post_comments")} if needed to avoid repeating what others said.
   - Draft one comment using the formulas in ${topic("engagement")}: two to five sentences, specific, in the user's voice.
   - No pitch, no links unless the user asks, and no tagging.
   - If the comment needs the user's own experience or a number, ask for it; never invent one.

6. Send one at a time:
   - ${t("comment_on_post")} returns a preview. Show it word for word, then call ${t("confirm_action")} only after an explicit yes for that comment.
   - Use ${t("react_to_post")} only on posts the user genuinely values, with the same approval rule (unless the user has turned reaction confirmations off).

7. Stop at the time budget or the caps. Summarise what was sent and who's worth following up with, and offer to note relationship details in ${t("growth_profile")}.

Never comment on posts the user hasn't read, never write generic praise, and never take part in pods or arranged engagement.

${SAFETY_RULES}`,
  },
  {
    name: "profile_audit",
    title: "Audit my LinkedIn profile",
    description: "Read the user's profile with get_my_profile, score it against the playbook's 12-point checklist, and propose specific rewrites the user can apply.",
    args: {
      goal: "What the profile should achieve, e.g. leads, a job, followers.",
      target_role: "For job seekers: the role they're targeting.",
    },
    render: (args) => `Audit the user's LinkedIn profile and propose specific improvements.
${given(args, { goal: "Goal", target_role: "Target role" })}
1. Call ${t("get_my_profile")} with the sections about, experience and skills, plus any others that help. Also call ${t("growth_profile")} (get) for the ICP and positioning, and ${t("growth_strategy")} (get) for the goal.

2. Read ${topic("profile")} and use its 12-item checklist.

3. Score each item 0, 1 or 2, with a one-line reason based on what you can see. Some items, such as the photo, cover image and Featured section, may not be in the data: say so, and ask the user to describe them or share a screenshot.

4. Give the total out of 24 and the three fixes with the biggest impact.

5. Propose rewrites:
   - three headline options using the formulas;
   - an About section draft following the six-part structure;
   - a Featured line-up;
   - skills to pin;
   - Follow or Connect as the primary button;
   - where relevant to the goal, Open to Work settings, a Service Page or a newsletter.
   Use only true information from the profile and the user; mark missing proof as [GAP: …].

6. Explain that linkedin-mcp can read the profile but not edit it: the user makes the changes in LinkedIn. Give them a short checklist to work through. If they approve positioning changes, save them with ${t("growth_profile")}.

${SAFETY_RULES}`,
  },
  {
    name: "monthly_growth_review",
    title: "Monthly LinkedIn growth review",
    description: "Review last month's posts and profile analytics against the strategy and the user's own baseline, record a snapshot with growth_report, and propose one experiment and one change.",
    args: {
      month: "The month to review, e.g. 2026-11. Defaults to the last full month.",
    },
    render: (args) => `Run the user's monthly LinkedIn growth review. Be honest about noise: say "consistent with chance" when it is.
${given(args, { month: "Month" })}
1. Load the plan and history: ${t("growth_strategy")} (get) for the goal, primary metrics, target funnel ratio and current experiment, and ${t("growth_report")} for earlier snapshots and the baseline.

2. Collect data:
   - ${t("get_my_posts")} (limit 20) for recent posts and their counts.
   - ${t("get_post_analytics")} for a handful of posts from the period: the best few, the worst few, and any experiment posts. Each is a separate page load, so keep it to about eight.
   - ${t("get_profile_analytics")} for followers, profile viewers, search appearances and trends.

3. Record the snapshot with ${t("growth_report")}.

4. Analyse it using ${topic("measurement")}:
   - Set the baseline as the median of the last 10–20 posts.
   - Express each post as a ratio to baseline on the goal's primary metric.
   - Group by pillar, format, funnel stage and hook type.
   - Judge experiments with the sign test.
   - Note confounders, and state the small-sample caveats plainly.

5. Report:
   - headline numbers against last month;
   - what beat baseline and what fell short;
   - the funnel mix against the target;
   - qualitative wins (ask the user about DMs, calls, invitations and recruiter messages, which the data can't see);
   - the experiment's result;
   - one experiment for next month and one thing to stop.

6. Propose strategy changes and apply them with ${t("growth_strategy")} only after explicit approval. Save the insights with ${t("growth_report")}.

${SAFETY_RULES}`,
  },
  {
    name: "repurpose_post",
    title: "Repurpose a post",
    description: "Turn one strong post into several new assets (carousel, quote card, follow-up, opposite angle, newsletter section), each with a new hook, saved to the idea bank and published only with approval.",
    args: {
      post_url: "URL of the user's own post to repurpose (optional; otherwise suggest strong candidates).",
      formats: "Formats wanted, e.g. carousel, quote card, follow-up post.",
    },
    render: (args) => `Repurpose one of the user's strong posts into new assets.
${given(args, { post_url: "Post", formats: "Formats wanted" })}
1. Choose the source:
   - If a post URL was given, check it's the user's own post and how it did, with ${t("get_post_analytics")}, and read the comments with ${t("get_post_comments")}: questions and objections are raw material.
   - Otherwise, use ${t("get_my_posts")} and ${t("growth_report")} to suggest the three best candidates by ratio to baseline on saves, sends and substantive comments.

2. Read the repurposing section of ${topic("content-strategy")}.

3. Extract the core: the idea in one sentence, the best lines, the proof, and the questions from the comments.

4. Propose five to eight derivatives. For each, give the format, the angle, a new hook, the funnel stage and suggested timing, spaced weeks apart. Options:
   - a carousel (${t("create_carousel")});
   - a quote card (${t("create_quote_card")});
   - a follow-up post built from the comments;
   - the opposite angle, or the common mistake;
   - a customer-question version;
   - a newsletter section;
   - a short video script;
   - answers to use in comments.

5. The user picks. Draft each one as in the write_post prompt, including ${t("review_post")}. Never reuse identical text.

6. Save the derivatives with ${t("growth_ideas")}, linked to the source post, and place approved ones in ${t("growth_calendar")}.

7. Publish or schedule each one separately: call ${t("create_post")} or ${t("schedule_post")}, show the preview word for word, and call ${t("confirm_action")} only after an explicit yes. Respect the daily post cap and keep versions of the same idea well apart.

${SAFETY_RULES}`,
  },
  {
    name: "reply_to_comments",
    title: "Reply to comments on my posts",
    description: "Find comments on the user's recent posts, triage them, draft substantive replies in their voice, and send each reply only after it is approved.",
    args: {
      post_url: "URL of the post whose comments to answer (optional; otherwise the most recent posts).",
    },
    render: (args) => `Help the user reply to comments on their LinkedIn posts.
${given(args, { post_url: "Post" })}
1. Find the comments:
   - If a post URL was given, call ${t("get_post_comments")} for it.
   - Otherwise use ${t("get_notifications")} to find recent comments on the user's posts, or ${t("get_my_posts")} and then ${t("get_post_comments")} for the latest one to three posts.

2. Triage the comments:
   - questions;
   - thoughtful additions;
   - disagreement;
   - praise;
   - spam or bad faith: skip these, and suggest hiding or reporting abuse in LinkedIn.
   Skip comments the user has already answered.

3. Call ${t("get_limits")}. If fewer replies are left than needed, prioritise questions, then disagreement, then additions, then praise.

4. Draft replies in the user's voice (voice samples from ${t("growth_profile")}), following ${topic("engagement")}:
   - Answer fully, add a detail, or ask a real follow-up, in one to four sentences.
   - No generic "Thanks!", no pitching.
   - If an answer needs facts you don't have, ask the user.

5. Show all drafts as a numbered list for edits. Then send them one at a time: ${t("reply_to_comment")} (post_url, comment_id, text) returns a preview. Show it word for word and call ${t("confirm_action")} only after an explicit yes for that reply. Never batch-confirm.

6. Save strong questions as new ideas with ${t("growth_ideas")} (comment-to-post repurpose). Ask the commenter's permission before naming them in a post.

${SAFETY_RULES}`,
  },
];

function promptResult(p: GrowthPrompt, args: Record<string, string | undefined>): GetPromptResult {
  return { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.render(args) } }] };
}

/** Registers every growth prompt on the server. */
export function registerGrowthPrompts(server: McpServer): void {
  for (const p of GROWTH_PROMPTS) {
    const argsSchema = Object.fromEntries(Object.entries(p.args).map(([key, description]) => [key, z.string().optional().describe(description)]));
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema }, (args) => promptResult(p, args));
  }
}
