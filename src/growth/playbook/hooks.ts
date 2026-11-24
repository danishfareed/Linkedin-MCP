import type { PlaybookTopic } from "./types.js";

export const hooks: PlaybookTopic = {
  id: "hooks",
  title: "Hooks and the first lines",
  summary:
    "How the opening lines decide whether a post is read: the 'see more' fold, sixteen hook types with the psychology behind each, 48 original example hooks across niches, a method for writing hook options, and what to avoid (clickbait, false suspense, fake numbers).",
  keywords: ["hook", "opening line", "first line", "see more", "fold", "headline", "attention", "curiosity", "clickbait", "scroll"],
  body: `## Why the first lines matter

On LinkedIn, the feed shows only the start of a post. Readers decide in a second or two whether to click "see more", and that click is a signal of interest that the feed's dwell-time models learn from (see the algorithm topic). LinkedIn's own creator guidance recommends "An engaging hook at the beginning of the post" ([LinkedIn Create](https://members.linkedin.com/create-start)) and, for video, "a clear, genuine hook at the beginning" ([LinkedIn Create](https://members.linkedin.com/create-grow)).

A hook has one job: make the *right* reader want the rest, honestly. It is a promise. The body must keep it.

## The "see more" fold

LinkedIn doesn't publish where posts are cut off, and the cut-off depends on the device, the screen width, line breaks and whether the post has media.

- AuthoredUp says roughly 210 characters show on desktop and about 140 on mobile, without describing how it measured this ([AuthoredUp, 2026](https://authoredup.com/blog/linkedin-character-limit)).
- Other tools describe the cut as line-based: several lines for a text-only post, fewer when an image or document is attached.
- Van der Blom's 2021 report placed "see more" after the third line ([2021 report](https://www.slideshare.net/slideshow/linked-in-algorithm-report-3rd-edition-2021-v1/250359114)).

**Working rule:** make the hook complete within the first one or two lines and about 140 characters, so it works on mobile, where most people read. Every blank line uses up visible space, so don't open with a blank line or a one-word line followed by space. Check the preview on a phone before publishing.

The line just after the fold matters too. Once someone clicks, the next sentence must reward them immediately with the substance, not more throat-clearing.

## What the data says about hooks

- **[Data]** In AuthoredUp's analysis of 309,614 posts (December 2025 – May 2026), shorter opening lines had higher median engagement: 2.61% for 0–40 characters down to 2.08% for over 200 ([AuthoredUp, 2026](https://authoredup.com/blog/linkedin-hook-examples)).
- **[Data]** The same company's datasets rank hook *styles* differently: one ranked story openers first and questions last; another (417,550 openers) ranked contrarian openers first (3.07%) and questions near the bottom ([AuthoredUp, 2026](https://authoredup.com/blog/linkedin-thought-leadership)). The consistent signal is that generic question openers underperform; the ordering of the rest is not stable.
- All of this is correlational and comes from one tool's users. A short, specific, honest first line is the safest default; beyond that, test.

## Sixteen hook types and why they work

Every number in the examples below is illustrative. Replace it with your real figure, or remove it. Never publish a number you can't stand behind.

### 1. Specific result plus the surprising method

**Mechanism:** concreteness makes the claim credible and memorable; the unexpected method opens a curiosity gap (see psychology: concreteness, information gap). Works best when the method is genuinely counter-intuitive.

- "We cut churn from 4.1% to 2.6% a month without touching the product. We changed who we let sign up."
- "Our time-to-hire fell from 41 days to 23 after we deleted one interview round. Nobody missed it."
- "Free shipping over $50 lost us money for a year. Raising the threshold to $75 fixed our margin and barely moved conversion."

### 2. Contrarian claim

**Mechanism:** a pattern break (the Heaths' "unexpected") stops the scroll; in-group readers who share the frustration engage. Only use it for a view you actually hold and can defend in the body.

- "Your best-performing ad is probably your most expensive one. Cost per lead is hiding it."
- "Stop writing tickets for small bugs. On my team, anything under 30 minutes gets fixed by whoever finds it."
- "Discovery calls shouldn't start with discovery questions. The best reps I've coached start with a hypothesis."

### 3. The honest curiosity gap

**Mechanism:** Loewenstein's information gap: name a specific unknown the reader already cares about, then close it fully.

- "The feature our users requested most was the one they used least. The reason was in the support tickets."
- "One sentence in our renewal email doubled the replies. It isn't a question."
- "Our churn model was 92% accurate and useless. Accuracy was the wrong number to watch."

### 4. In the middle of the story

**Mechanism:** narrative transportation: a concrete moment with time, place and stakes pulls the reader in before they decide to resist.

- "At 11:40 p.m. the night before launch, our payment provider froze our account."
- "The interviewer stopped me halfway through my answer: 'You've rehearsed this, haven't you?'"
- "Our biggest client called on a Friday to say they were taking everything in-house. We had 30 days."

### 5. Mistake or confession

**Mechanism:** admitting a real error builds trust and liking, and readers want to avoid the same loss (loss aversion).

- "I promoted my best engineer to team lead. It was the worst decision I made that year, for both of us."
- "I underpriced my first 12 projects. The fix wasn't raising my rate; it was changing what I sold."
- "I spent three weeks polishing a design that tested worse than the napkin sketch."

### 6. Identity call-out

**Mechanism:** the self-reference effect and in-group signalling: naming a precise group makes members feel the post is for them.

- "If you're the only finance person at a startup, this month-end checklist is for you."
- "For engineers who just became managers and miss writing code: you're not doing it wrong."
- "Grant writers: funders don't read your needs statement the way you think they do."

### 7. Numbered promise

**Mechanism:** processing fluency and a clear, bounded payoff: the reader knows what they'll get and how long it will take.

- "5 lines I deleted from my CV that got me more interviews, with the before and after."
- "7 questions that tell you within 10 minutes whether a deal is real."
- "4 spreadsheets every operations team should retire, and what replaces each one."

### 8. Data surprise

**Mechanism:** unexpected plus credible: a finding from real data contradicts what the reader assumes.

- "We read 300 exit interviews. Pay was only the fourth most common reason people left."
- "Our late deliveries weren't the drivers' fault. Most traced back to one warehouse shift."
- "I reviewed my last 100 posts. The ones I almost didn't publish did best."

### 9. Before and after

**Mechanism:** contrast makes change concrete and implies a method worth learning (social proof when it's someone else's result).

- "Last year a refund took nine emails. Now it takes one. Same team, same tools."
- "My first newsletter had 14 subscribers, and six were relatives."
- "Our clinic's no-show rate was 22%. Two changes to the reminder text brought it under 10%."

### 10. The cost the reader is already paying

**Mechanism:** loss aversion, used proportionately: point to a real, current cost rather than a hypothetical gain.

- "If your contractor agreement doesn't say who owns the code, you might not."
- "The most dangerous password in your company is in a shared spreadsheet called 'logins'."
- "Most founders discover their runway is shorter than they thought in the same week: the week a big invoice is paid late."

### 11. Borrowed authority or a news peg

**Mechanism:** a recognisable name or event supplies attention (authority, triggers); your analysis must supply the value.

- "I read every pricing page in our category. Only the market leader's answers the question buyers ask most: what happens if I cancel?"
- "A public company's earnings call is the best free sales training you'll get this quarter."
- "Read the job ads from the last three companies that hired for your role. They're a free market report."

### 12. "How I" process

**Mechanism:** practical value (STEPPS) and reciprocity: the reader expects a usable method.

- "How I prepare for a first sales call in 15 minutes, using only the prospect's last three posts."
- "How we review pull requests in under a day without lowering the bar."
- "How I turn one customer conversation into a week of posts."

### 13. Myth versus reality

**Mechanism:** correcting a belief the reader holds creates a gap between what they think and what's true; authority comes from the evidence you bring.

- "'Nobody reads cover letters' is true until two candidates are tied."
- "Posting every day isn't what grew my audience. Deleting half my drafts did."
- "'Talk to your users' is incomplete advice. Talk to the ones who left."

### 14. Analogy or metaphor

**Mechanism:** concreteness: a familiar image makes an abstract problem instantly clear and memorable.

- "Your CRM is a junk drawer. Everything is in there and nobody can find the scissors."
- "A budget is a hypothesis, not a promise. Read variances like test results."
- "Recurring meetings are subscriptions you forgot to cancel."

### 15. The question only your reader can answer

**Mechanism:** self-reference: a precise question makes readers check their own situation. Generic questions ("What do you think about AI?") underperform; specific ones that create a small itch work.

- "When did someone on your team last tell you a project would fail before it did?"
- "What would you cut from your pitch if you had 60 seconds?"
- "Could a stranger tell what you do from your headline alone?"

### 16. A line of dialogue

**Mechanism:** a quote is a micro-story with a character and tension, so it transports the reader immediately.

- "'We love the product. We're not renewing.' That call changed how we measure customer health."
- "'Why would anyone pay for that?' my co-founder asked in our first week."
- "'Can you explain this to my CFO in one slide?' The best feedback a prospect ever gave me."

## Writing hook options: a method

1. **Start from the point, not the hook.** Write the one-sentence takeaway of the post first. A hook for a vague idea will be vague.
2. **Write at least eight candidate hooks** using different types from the list above. The first one is usually the most generic.
3. **Score each candidate** on four questions: Is it true and supported by the body? Would my target reader stop for it (and would the wrong reader scroll past)? Is it specific (a number, name, object, moment)? Does it fit in about 140 characters?
4. **Pick two or three and read them aloud.** Cut words until it still works. Remove throat-clearing ("I want to talk about…", "Let's discuss…").
5. **Check the payoff.** The first sentence after the fold must deliver, and the strongest moment of the post must match the promise (peak-end rule).
6. **Keep the losers.** Unused hooks often become the angle for a follow-up post or a comment.

## Strengthening a weak hook

| Weak | Why it fails | Stronger |
|---|---|---|
| I've been thinking a lot about leadership lately. | No stakes, no specifics, about the writer not the reader. | I stopped running weekly 1:1s for a month. Two people on my team said it was the best month of the year. |
| AI is changing everything in marketing. | Generic claim every reader has seen. | We let AI write our product emails for a quarter. Open rates held. Replies halved. |
| Here are some tips for job seekers. | Promises nothing specific. | Three things recruiters check on your profile before they read your CV. |
| Big news! | False suspense; the reader learns nothing. | We just signed our first hospital customer, after 14 months and 31 demos. |
| Agree? | Engagement bait; LinkedIn demotes direct requests for engagement. | (Remove it. End with your strongest line or a genuine, specific question.) |

## What to avoid

- **Clickbait:** a hook the body doesn't pay off. Readers notice, and clickbait headlines measurably reduce perceived credibility ([Molyneux & Coddington, 2020](https://doi.org/10.1080/17512786.2019.1628658)).
- **False suspense:** "I can't believe what happened…", "This changed everything…", "Big news!" followed by something ordinary.
- **Fake or rounded-up numbers:** never invent a statistic, survey or result. If the number is an estimate, say so ("roughly", "in my experience").
- **Fake drama:** "I got fired today" when you resigned, invented health scares, or using a tragedy to sell. It breaks trust and can break LinkedIn's rules on misleading content.
- **Engagement bait:** "Comment YES", "Like if you agree", "Tag someone who…", "Repost to help my reach". LinkedIn has said it doesn't promote these ([LinkedIn, 2022](https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive); [LinkedIn, 2026](https://news.linkedin.com/2026/ImprovingTheFeed)).
- **Rage bait:** deliberately inflammatory claims you don't hold, or attacks on a group. They may get comments, but they attract the wrong audience and damage reputation.
- **Over-formatted openers:** emoji walls, ALL CAPS, Unicode bold for whole sentences (screen readers struggle with styled Unicode characters), or a single word followed by blank lines.
- **Recycled templates readers recognise:** "Unpopular opinion:", "Nobody talks about this:", "I'm humbled and honoured to announce…", "Here's the thing:". They signal a formula and, increasingly, AI writing.
- **Questions without stakes:** "What do you think?" as a first line gives no reason to read.

## Hook checklist

- [ ] The hook states or implies one specific idea.
- [ ] It names, or clearly attracts, the intended reader.
- [ ] It contains at least one concrete element (number, name, object, moment, quote).
- [ ] It works within the first one or two lines (about 140 characters) on mobile.
- [ ] Every fact in it is true and supported in the body.
- [ ] The first sentence after the fold delivers immediately.
- [ ] It doesn't use engagement bait, false suspense or a formula readers recognise.
- [ ] It sounds like the author speaking, not like a template.
`,
};
