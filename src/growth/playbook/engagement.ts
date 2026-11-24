import type { PlaybookTopic } from "./types.js";

export const engagement: PlaybookTopic = {
  id: "engagement",
  title: "Engagement playbook",
  summary:
    "How to grow through conversation: value-adding comment formulas, target-account lists, a sustainable daily engagement budget, replying to comments on your posts, DM etiquette without pitch-slapping, and relationship building. Engagement pods and automated engagement violate LinkedIn's policies.",
  keywords: ["engagement", "comments", "commenting", "reply", "dm", "direct message", "outreach", "networking", "relationship", "pods", "engagement pod", "automation", "connection request", "target accounts", "pitch slap"],
  body: `## Why engagement is part of growth

Posting is half of LinkedIn. The other half is showing up in other people's conversations:

- Comments put your name, photo and headline in front of other people's audiences, often more people than your own early posts reach.
- LinkedIn's feed values constructive conversation: its ranking signals include "how constructive or professional the conversation is" ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1339724)), and its feed lead has said "authentic conversations and connection signify great engagement" ([PR Daily, 2025](https://www.prdaily.com/what-works-and-doesnt-on-linkedin-according-to-guardians-of-the-feed/)).
- Repeated, useful appearances make you familiar (the mere-exposure effect), and generosity creates goodwill (reciprocity). See the psychology topic.

## The rule: no pods, no automated engagement

**Engagement pods and automated engagement violate LinkedIn's policies.** Don't use them, and don't let any tool do them for you.

- LinkedIn's Professional Community Policies: "Don't do things to artificially increase engagement with your content. Respond authentically to others' content and don't agree with others ahead of time to like or re-share each other's content" ([Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies)).
- LinkedIn, March 2026: an engagement pod is "a coordinated group of people that like, comment and share posts to attempt to boost visibility and virality. This form of inauthentic activity erodes trust and is not allowed on LinkedIn." And: "Automated comments are comments posted to LinkedIn using a browser extension, script, or third party tool… and they aren't allowed on LinkedIn." Consequences include hiding detected automated comments from "Most Relevant", possible account restrictions, and removal from programs such as Top Voices ([LinkedIn, 2026](https://news.linkedin.com/2026/authentic-content-and-conversations)).
- LinkedIn's User Agreement prohibits using "bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement" ([User Agreement, section 8.2](https://www.linkedin.com/legal/user-agreement)).
- In 2025 Oscar Rodriguez of LinkedIn wrote that "Our goal is to make engagement pods ineffective" and that LinkedIn will "flag posts that look artificially boosted, and limit their reach in the feed" ([Rodriguez, 2025](https://www.linkedin.com/pulse/linkedin-where-real-conversations-matter-oscar-rodriguez-ejwee/)).

**How linkedin-mcp fits:** it helps you find posts and draft comments, but every comment, reply, reaction and message is shown to you as a preview and sent only after you approve that specific one, under daily caps. It never comments on a schedule or in bulk. You are still the author: only approve words you'd write yourself, about posts you actually read. Be aware that LinkedIn's User Agreement restricts automated access in general (see the README's disclaimer); this server reduces risk but can't remove it.

## Value-adding comment formulas

A good comment makes the original post better and makes a reader curious about you. Aim for two to five sentences with one specific idea. Van der Blom's 2024 report estimated that longer comments (over 15 words) carry more weight than short ones; whatever the exact weight, substance is what earns replies and profile visits.

1. **Add a data point:** "One number from our side: when we moved the pricing call earlier, deals closed about a week faster, but discounting went up. Curious whether you saw the same trade-off."
2. **Extend with an example:** "This matched our experience hiring our first SDR. The thing that made the difference was having them sit in on ten customer calls before writing a single email."
3. **Respectful nuance or disagreement:** "Agree for teams over 20 people. Under that, I've seen weekly planning meetings cost more than they save. A shared doc updated on Mondays worked better for us."
4. **A sharp follow-up question:** "How did you decide which steps to remove? Was it data from the funnel or customer interviews?"
5. **Apply it to a specific context:** "For anyone in healthcare reading this: the same principle works for appointment reminders. Specific time plus one action beat generic reminders for us."
6. **Connect two ideas:** "This pairs well with the jobs-to-be-done idea: the feature isn't the product, the progress is."
7. **Name what's underrated:** "The second point is the one people will skip, and it's the important one. Writing the rejection reason down is what made our pipeline reviews honest."
8. **A genuinely useful resource:** link to someone else's work (or yours, rarely, and only if it directly answers the question), with one line on why it helps.

**Avoid:**

- "Great post!", "Thanks for sharing", "100% agree", emoji-only comments: they add nothing and nobody visits your profile because of them.
- Generic AI-sounding comments ("This is a powerful reminder of the importance of…"): readers recognise them, and LinkedIn is filtering automated comments.
- Pitching in comments, or "DM me" under someone else's post.
- Hijacking: making the comment about you rather than the post.
- Tagging people in comments to pull them into a thread they didn't ask for.

## Target-account lists

Engagement works best when it's focused on the same people over time. Keep a short list in three tiers (store it with growth_profile):

| Tier | Who | How many | How to engage |
|---|---|---|---|
| A: ICP | Buyers, hiring managers or decision makers you want to know you | 15–25 | Thoughtful comments when they post; never pitch in public; connect once there's been genuine interaction |
| B: Peers | People at your level in your niche | 10–20 | Regular conversation, collaboration, sharing each other's work with real commentary (never pre-arranged engagement) |
| C: Larger voices | Creators and publications your ICP follows | 5–10 | Substantive comments soon after they post; their audience sees good comments |

Build the list gradually from posts you actually read: your feed (get_feed), posts on your topics (search_posts, which counts against the daily search cap), and specific people's recent posts (get_person_posts, which counts as a profile view). The caps are deliberate: don't use them to build big lists. Review the list monthly; drop people you've stopped finding useful.

## A sustainable daily budget

**[Practitioner]** 20–30 minutes on weekdays is sustainable for most people and enough to compound:

1. **5 minutes:** reply to comments on your own recent posts and to messages.
2. **10–20 minutes:** read posts from your target list and leave three to six thoughtful comments where you have something to add.
3. **5 minutes:** react to posts you genuinely found useful, and note ideas for your own posts.

This fits well inside linkedin-mcp's default daily caps (15 comments and replies, 40 reactions; halved during the first 14 days). If a cap is reached, stop for the day: the caps exist to keep your activity at a human pace. Quality beats volume: five comments people reply to are worth more than thirty that nobody reads.

## Replying to comments on your posts

- **Be there after you post.** LinkedIn's feed models value timely creator responses ([LinkedIn Engineering, 2019](https://www.linkedin.com/blog/engineering/feed/community-focused-feed-optimization)), and LinkedIn's advice is to "respond to commenters and encourage back and forth" ([LinkedIn, 2019](https://news.linkedin.com/2019/January/what-s-in-your-linkedin-feed--people-you-know--talking-about-thi)). Plan to be available for an hour or two after posting.
- **Reply with substance:** answer the question, add a detail you left out, or ask a follow-up. A thread of real exchanges is better for readers than fifty "Thanks!" replies.
- **Prioritise:** questions first, then thoughtful disagreement, then additions, then appreciation.
- **Handle disagreement well:** thank them, restate their point fairly, explain your view or concede if they're right. Public grace builds more trust than winning.
- **Don't feed trolls:** ignore bad-faith comments, and hide or report harassment. LinkedIn's policies don't allow "targeted personal attacks, intimidation, shaming" ([Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies)).
- **Mine the thread:** great questions and objections become future posts (comment-to-post repurpose, with permission to name the person).

## DM etiquette: no pitch-slapping

"Pitch-slapping" is sending a sales pitch in a connection request or the first message to someone who doesn't know you. It fails and it annoys people. LinkedIn's policies say: "Do not use our invitation feature to send promotional messages to people you don't know" ([Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies)).

**Connection requests:** if you've interacted (comments, a shared event), a request without a note is fine; they'll recognise you. A note helps with people who don't know you, but free accounts can add a personalised note to only a few requests a month, up to 200 characters each ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a563153)). Use notes for the requests where context really matters.

**First messages:**

- Reference something specific and real (their post, a shared problem, a mutual connection).
- Give something or ask one easy, specific question. No calendar links, no attachments, no pitch.
- Ask permission before offering help: "Would it be useful if I shared how we handled that?"
- Follow up at most once with something new. Silence is an answer.

| Pitch-slap | Relationship-first |
|---|---|
| "Hi Sam, I help SaaS companies 3x their pipeline. Do you have 15 minutes this week?" | "Hi Sam, your post on cutting the demo from 45 to 20 minutes was useful; we're testing the same thing. Did removing the slide deck change your close rate, or just the length?" |
| "Thanks for connecting! Here's a link to book a call." | (No message until there's a reason. Then: something useful or a genuine question.) |

Never use automated message sequences or mass messaging. linkedin-mcp deliberately doesn't do campaigns: each message is previewed and approved individually, under a daily cap.

## Relationship building

The value of a network is mostly in the relationships it makes possible, including loose ones. Mark Granovetter's classic paper showed that acquaintances ("weak ties") are an important source of new information and job opportunities ([Granovetter, 1973](https://doi.org/10.1086/225469)). A large set of experiments on LinkedIn involving more than 20 million people found that moderately weak ties were the most useful for job mobility ([Rajkumar et al., 2022](https://doi.org/10.1126/science.abl4476)).

**A relationship ladder** (move up one rung at a time, only when it's natural):

1. Notice: read their posts; react when you mean it.
2. Comment: add value to their posts a few times.
3. Exchange: they reply; you have a short public conversation.
4. Connect: send a request; they know who you are.
5. Message: about a shared topic or something useful to them.
6. Collaborate: a call, a co-written post, a LinkedIn Live, a guest newsletter section.
7. Refer: introduce them to someone useful, or recommend them.

**Give first:** introductions, thoughtful reshares with your commentary, recommendations, specific feedback, credit in your posts. Keep brief notes on people (what they work on, what they asked about) so your follow-ups are personal.
`,
};
