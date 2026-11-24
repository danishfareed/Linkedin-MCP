import type { PlaybookTopic } from "./types.js";

export const strategy: PlaybookTopic = {
  id: "content-strategy",
  title: "Content strategy",
  summary:
    "Positioning and an ICP worksheet, content pillars, the TOF/MOF/BOF funnel with starting ratios by goal and the reasons, CTA ladders, lead magnets, cadence by growth stage, a repurposing system, batching workflows and a weekly operating rhythm.",
  keywords: ["strategy", "positioning", "icp", "ideal customer", "audience", "pillars", "funnel", "tof", "mof", "bof", "cta", "call to action", "lead magnet", "cadence", "repurpose", "batching", "calendar", "weekly rhythm", "goals"],
  body: `## Start with the business goal

A LinkedIn strategy is a plan for turning attention into a specific business outcome. Decide the outcome first, because it changes everything downstream:

- **Audience growth:** more of the right followers, as an asset for later.
- **Leads and pipeline:** conversations with potential buyers.
- **Hiring:** applications from people you want.
- **Job search:** recruiters and hiring managers who know what you can do.
- **Thought leadership:** being the person your industry cites, invites and quotes.

Write the goal down with a measure and a time frame ("10 qualified sales conversations a quarter from LinkedIn", "three interviews for senior product roles in eight weeks"). Store it with growth_profile, and draft the strategy with growth_strategy so it can be approved and revisited.

## Positioning

Positioning answers: *for whom* are you the obvious choice, and *why you rather than the alternatives*? April Dunford's *Obviously Awesome* (2019) breaks product positioning into components that adapt well to a person:

1. **Competitive alternatives:** what would your reader do if you didn't exist? (Hire an agency, use a spreadsheet, ask a colleague, do nothing.)
2. **Unique attributes:** what do you have that the alternatives don't? (A specific track record, a method, data, an unusual career path.)
3. **Value and proof:** what do those attributes make possible for the reader, and what evidence shows it?
4. **Who cares most:** the specific people for whom that value matters most.
5. **Category or frame:** the context that makes your value obvious ("fractional CFO for bootstrapped SaaS", not "finance professional").

**Positioning statement template:**

> I help [specific reader] [achieve a specific outcome or avoid a specific problem] through [your distinctive approach], unlike [their usual alternative], because [proof].

**Test:** could a competitor or peer publish the same sentence unchanged? If yes, it's not positioning yet. Narrow the reader, sharpen the outcome, or add proof only you have. LinkedIn's own creator guidance says "Your unique expertise is what makes you stand out" ([LinkedIn Create](https://members.linkedin.com/create-start)), and its ranking reads your professional identity and topics (see the algorithm topic), so a clear position helps distribution as well as persuasion.

## ICP worksheet

Your ideal customer profile (ICP), or ideal reader, is the person whose attention is worth most to your goal. Fill this in from real conversations, not imagination. Rob Fitzpatrick's *The Mom Test* (2013) is a good guide to asking about past behaviour ("when did that last happen? what did you do?") rather than hypotheticals ("would you use…?"). The jobs-to-be-done lens ([Christensen et al., HBR, 2016](https://hbr.org/2016/09/know-your-customers-jobs-to-be-done)) helps: people "hire" a product or a person to make progress in a specific circumstance.

| Field | Question to answer | Example |
|---|---|---|
| Role and seniority | Who exactly? | Head of Finance, first finance hire |
| Organisation | Type, size, stage, sector | Bootstrapped B2B SaaS, 20–80 people |
| Trigger events | What makes this urgent now? | First audit, fundraising, a board asking for forecasts |
| Job to be done | What progress are they trying to make? | Close the books in days, not weeks, without hiring |
| Top problems, in their words | Phrases they actually use | "Month-end eats my whole second week" |
| What they've tried | Current alternatives and why they disappoint | Spreadsheets, an outsourced bookkeeper |
| Objections | Why they hesitate | "Our setup is too custom", "no time to switch" |
| Desired outcome and measure | How they'd know it worked | Close in five working days; one source of truth |
| Information diet | Who and what they trust | Peer CFO communities, specific newsletters |
| Current beliefs | What they already think is true | "Automation is for bigger companies" |
| Awareness stage | Unaware, problem-aware, solution-aware, product-aware, most aware | Mostly problem-aware |

The awareness stages come from Eugene Schwartz's *Breakthrough Advertising* (1966). They map onto the funnel: unaware and problem-aware readers need TOF content; solution-aware readers need MOF; product-aware readers need BOF proof.

Save the worksheet in growth_profile (audience fields, verbatim phrases, objections) so every idea and draft can be checked against it.

## Content pillars

Pillars are the three to five topics you'll be known for. Choose them where four circles overlap: what you know deeply and can prove; what your ICP needs; what you won't get bored of; and what leads toward your goal.

A balanced set usually includes:

- **One or two expertise pillars:** the core skills your reader pays for (pricing, hiring engineers, B2B onboarding).
- **A point-of-view pillar:** your opinions about where your industry is going and what it gets wrong.
- **A proof pillar:** your work, clients, results and process.
- **A human pillar:** how you work, lessons from your career, the people around you. Keep it connected to your professional theme.

For each pillar, write a **pillar card**:

- Name and the thesis (the belief behind it, in one sentence).
- The reader questions it answers.
- The proof bank: stories, numbers, clients, screenshots you can use.
- Typical formats and the funnel stages it serves.
- Five to ten starter angles.

Map pillars against funnel stages in a grid. Each cell should have a few ideas; an empty BOF column means nothing in your content shows people how to work with you.

## The funnel: TOF, MOF, BOF

- **Top of funnel (TOF):** earns attention from relevant strangers. Stories, opinions, news reactions, contrarian takes, predictions. Success: reach among your ICP, new followers who match your ICP, profile views.
- **Middle of funnel (MOF):** builds trust by teaching. Frameworks, processes, teardowns, templates, carousels. Success: saves, sends, comments with substance, newsletter subscribers.
- **Bottom of funnel (BOF):** shows proof and makes the next step easy. Case studies, results, customer questions about buying, offers, hiring posts. Success: DMs, calls booked, applications, replies from buyers.

### Starting ratios by goal

These are heuristic starting points from practice, not research findings. Start with them, then adjust after six to eight weeks of your own data (see measurement).

| Goal | TOF | MOF | BOF | Why |
|---|---|---|---|---|
| Balanced default | 40% | 40% | 20% | Enough reach to keep growing, enough teaching to build trust, a steady but light trickle of proof. |
| Audience growth | 60% | 30% | 10% | Reach is the constraint; BOF posts reach fewer people, so keep them rare until the audience exists. |
| Leads and pipeline | 30% | 45% | 25% | Buyers need trust (MOF) and proof (BOF); too much TOF attracts people who will never buy. |
| Hiring | 40% | 30% | 30% | Candidates need to know you exist (TOF) and what the work is really like (BOF: roles, team, process). |
| Job search | 25% | 50% | 25% | Hiring managers need evidence of skill (MOF: how you think and work) and a clear signal you're available (BOF). |
| Thought leadership | 45% | 45% | 10% | Ideas and teaching are the product; overt selling undermines the authority you're building. |

Many posts serve two stages (a case study told as a story is BOF and TOF). Classify each post by its main job.

## CTA ladders

A call to action should match the stage of the post and the reader's level of trust. Climb one rung at a time (commitment and consistency):

| Rung | CTA | Use on |
|---|---|---|
| 0 | No CTA: end on the strongest line | Stories, opinions (TOF) |
| 1 | A reflection prompt ("Worth checking your own onboarding emails this week.") | TOF, MOF |
| 2 | A specific question you'll genuinely read ("What's the one step you'd add?") | TOF, MOF |
| 3 | Follow or subscribe for the series or newsletter | MOF |
| 4 | Get the resource (link in the post or first comment, or the Featured section) | MOF |
| 5 | Start a conversation ("If you're dealing with this, send me a message; happy to compare notes.") | BOF |
| 6 | Offer: book a call, apply, buy, with what happens next | BOF |

Rules:

- One CTA per post.
- Never ask for likes, reposts or "comment YES"; LinkedIn treats requests for reactions as engagement bait ([LinkedIn, 2022](https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive)).
- Avoid "comment [word] and I'll send it to you". It is a request for engagement, and it creates a pile of messages to send (this server caps messages at 15 a day by default). Link to the resource directly instead.
- Your profile is a permanent CTA: the headline, Featured section and About section should make the next step obvious (see the profile topic).

## Lead magnets

A lead magnet is a free resource that solves one specific problem for your ICP and leads naturally to what you offer.

**Criteria:**

- Solves one narrow problem quickly (usable in under 15 minutes).
- Specific to your ICP and your pillar ("the 12-point SaaS pricing page audit", not "marketing tips").
- Demonstrates your method, so using it makes your paid help more obviously valuable.
- Honest about what it is; no bait-and-switch.

**Types that work on LinkedIn:** checklists and audits, templates and scripts, calculators and spreadsheets, teardown libraries, benchmark reports from your own data, short email courses, recorded workshops.

**Delivery:** put it in your Featured section and link it from posts where it fits; announce it with a post that teaches the core idea in full (so the post is valuable on its own); ask for an email only if you will genuinely send useful follow-ups; use UTM tags on the link to measure which posts drive sign-ups.

## Cadence by growth stage

LinkedIn suggests "between 2-5 posts per week" ([LinkedIn Create](https://members.linkedin.com/create-start)). Data on frequency conflicts (see the algorithm topic), so treat frequency as something to test. Quality and consistency matter more than volume.

| Stage | Posts per week | Daily engagement | Focus |
|---|---|---|---|
| 0–1,000 followers | 2–3 | 20–30 minutes: thoughtful comments on posts your ICP reads | Find your voice and pillars. Most early reach comes from your comments on others' posts. Fix your profile first. |
| 1,000–10,000 | 3–4 | 20–30 minutes, plus replying to every substantive comment on your posts | Recurring series, a first lead magnet, collaborations with peers, carousels for your best frameworks. Consider a newsletter once you have a steady theme. |
| 10,000+ | 3–5 | 15–30 minutes, more weighted to your own comment threads | Newsletter, repurposing your best posts, community (events, Live), protecting quality as volume grows. If others help draft, you still approve every word. |

Keep at least a day between posts unless there's a reason (news, a launch). Daily caps in this server (two posts, 15 comments by default; halved during the first 14 days) are safety limits, not targets.

## Repurposing: one idea, many assets

Good ideas deserve more than one post. Treat each strong idea as an "atom" and build from it:

1. **Core post:** the original text post.
2. **Carousel:** the same idea as a step-by-step document (create_carousel).
3. **Quote card:** the single most quotable line as an image (create_quote_card).
4. **Follow-up post:** results, objections and questions from the comments a week or two later.
5. **Opposite angle:** the counter-argument, or the mistake people make applying it.
6. **Comment answers:** use the idea in substantive comments on others' posts on the same topic.
7. **Newsletter section:** a deeper version with examples.
8. **Customer-question version:** the idea answering a specific question someone asked.
9. **Short video:** you explaining it in under 90 seconds (vertical, captioned) if video suits you.

Rules:

- Change the hook, the angle and the examples each time; never repost identical text. LinkedIn said in 2026 it is "reducing recycled and click-driven posts" ([LinkedIn, 2026](https://news.linkedin.com/2026/ImprovingTheFeed)).
- Leave several weeks between versions of the same idea for the same audience.
- Repurpose winners: start with posts that beat your baseline on saves, sends or substantive comments.
- Track each asset back to its source idea in growth_ideas, so you can see which ideas keep paying off.

## Batching workflow

Writing one post at a time, on the day, produces rushed posts. Batch instead:

**Weekly batch (60–120 minutes):**

1. **Capture (15 min):** review the idea bank (growth_ideas) and add new raw material from the week: customer calls, sales objections, support tickets, questions you answered, mistakes, decisions, things you disagreed with.
2. **Select (10 min):** choose next week's posts against the calendar (growth_calendar) and the funnel ratio.
3. **Outline (15 min):** for each, write the one-sentence point, pick the format, list the evidence. Mark any missing facts.
4. **Draft (40 min):** write drafts, with several hook options each.
5. **Review (15 min):** run review_post on each draft, fix issues, read aloud.
6. **Schedule (5 min):** schedule approved posts with schedule_post. Each one shows a preview; schedule only what you've approved word for word.

**Monthly (60 minutes):** run a growth review (growth_report): what beat your baseline, what fell short, which pillar and stage are over- or under-served, one experiment for next month.

**Quarterly:** revisit positioning, ICP and pillars (growth_strategy). Retire pillars that don't serve the goal.

## Weekly operating rhythm

| Day | Do | Tools |
|---|---|---|
| Monday | Plan the week: confirm posts, check the calendar, check caps | growth_calendar, list_scheduled_posts, get_limits |
| Tuesday–Thursday | Publish or let scheduled posts go out; be available for an hour or two after posting to reply to comments | schedule_post, get_post_comments, reply_to_comment |
| Every weekday | 20–30 minutes of engagement: a handful of thoughtful comments on posts your ICP reads; reply to messages | get_feed, comment_on_post, get_inbox |
| Friday | Review the week's numbers against your baseline, capture new ideas, note what readers asked | get_my_posts, get_post_analytics, growth_ideas |

Consistency beats intensity. A rhythm you can keep for a year will outperform a burst you can keep for a month.
`,
};
