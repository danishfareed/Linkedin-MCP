import type { PlaybookTopic } from "./types.js";

export const formats: PlaybookTopic = {
  id: "post-formats",
  title: "Post methods and formats library",
  summary:
    "28 proven post methods (story with lesson, contrarian take, framework, case study, teardown, prediction, tech stack, carousel, poll, newsletter teaser, milestone, strategic tag and more). Each has how it works, why it works, the best funnel stage, the evidence it needs, its risks, and an original example outline.",
  keywords: ["post types", "methods", "formats", "templates", "carousel", "document", "poll", "case study", "teardown", "story", "framework", "listicle", "newsletter", "strategic tag", "tech stack", "pas", "bab"],
  body: `## How to use this library

A format is a container for an idea; it can't rescue a weak one. Pick the idea first (what do you know, have seen, or have done that your reader needs?), then choose the format that carries it best. Funnel stages are explained in the content-strategy topic: **TOF** (top of funnel) earns attention from the right strangers, **MOF** (middle) builds trust by teaching, **BOF** (bottom) shows proof and makes it easy to buy, hire or hire you.

Each entry lists the psychology behind it (see the psychology topic), and every example outline is a skeleton to fill with your own real material. Never fill a gap with invented facts: mark it and ask.

Practical notes for this server: create_post and schedule_post publish text, up to nine images, or one PDF/PPTX/DOCX document as a swipeable carousel. They don't create polls, videos, articles or newsletter editions; make those in LinkedIn directly. The create_carousel, create_quote_card and generate_image tools (where available) produce visuals you can attach.

## Story and opinion formats

### 1. Story with a lesson

- **How it works:** tell one specific episode from your work (a moment, a decision, a turn) and let one lesson come out of it. The story carries the idea; the lesson is stated once, briefly, near the end.
- **Why it works:** narrative transportation lowers counter-arguing and makes the lesson memorable; specific details make it credible; a strong last line uses the peak-end rule.
- **Best stage:** TOF and MOF.
- **Evidence it needs:** a real event you were part of, with concrete details (when, where, who said what). Permission from anyone identifiable.
- **Risks:** inflated or composite stories presented as true; a moral that doesn't follow from the events; "and that's why you should buy my course" endings.
- **Example outline:**
  1. Hook in the moment: "The customer was screen-sharing their spreadsheet when I realised our product wasn't in it."
  2. Context in two lines: who they were, what you expected.
  3. The turn: what you saw or learned.
  4. What you did next and what happened.
  5. The lesson in one sentence, applicable to the reader's work.
  6. Optional: a specific question about the reader's own experience.

### 2. Contrarian take

- **How it works:** state a view that goes against common advice in your field, then justify it with reasoning and evidence, and name where the common advice is still right.
- **Why it works:** unexpectedness stops the scroll; people who share the frustration engage; disagreement produces substantive comments. Credibility comes from the nuance.
- **Best stage:** TOF.
- **Evidence it needs:** your own experience or data showing the common advice failing, and a clear alternative.
- **Risks:** contrarianism for its own sake; straw-manning the mainstream view; attracting arguments rather than your audience. Only post views you hold.
- **Example outline:**
  1. Claim: "Annual plans are hurting early-stage SaaS companies."
  2. The common belief and why people hold it.
  3. What you saw instead (two or three concrete points).
  4. When the common advice is still right.
  5. What you recommend and the trade-off.

### 3. Opinion on news

- **How it works:** react to a recent event in your industry with an informed angle: what it means for your reader, what most coverage misses, what to do.
- **Why it works:** triggers (the news is already top of mind), borrowed authority from the event, and social currency for readers who share a sharp take.
- **Best stage:** TOF.
- **Evidence it needs:** a link to the primary source; verified facts; your relevant experience.
- **Risks:** getting facts wrong in the rush; hot takes on tragedies or layoffs (newsjacking); summarising the news without adding anything.
- **Example outline:**
  1. Hook: what happened plus your angle in one line.
  2. Two-line factual summary with the source.
  3. What it means for your reader specifically.
  4. What most people are missing.
  5. One action to take this week.

### 4. Industry prediction

- **How it works:** make a specific, non-obvious prediction about your field with a time frame and reasoning, and say how confident you are.
- **Why it works:** authority (you see the pattern first), curiosity, and comments from people who agree, disagree or add evidence.
- **Best stage:** TOF.
- **Evidence it needs:** signals you've personally seen (customer behaviour, pricing changes, hiring patterns, data).
- **Risks:** vague predictions ("AI will change everything") that can't be wrong; overconfidence. Revisit your predictions publicly later; being accountable builds trust.
- **Example outline:**
  1. Prediction with a date: "By the end of next year, most mid-market buyers will expect a sandbox before a demo."
  2. Three signals you're seeing.
  3. Why it's happening.
  4. What it means for people in your reader's role.
  5. Confidence level and what would prove you wrong.

### 5. Myth versus reality

- **How it works:** take a widely held belief in your field, show the evidence that it's wrong or incomplete, and give the more accurate version.
- **Why it works:** an information gap between what the reader believes and what's true; authority from evidence; practical value.
- **Best stage:** TOF and MOF.
- **Evidence it needs:** a source or data for the correction, not just your opinion.
- **Risks:** "myths" no one actually believes; replacing one oversimplification with another.
- **Example outline:**
  1. "Myth: you need 10,000 followers before LinkedIn can bring you clients."
  2. Why people believe it.
  3. Reality, with your evidence.
  4. What to do instead.

### 6. Mistakes and lessons

- **How it works:** describe a real mistake (yours or your team's), what it cost, and what you do differently now. A list version ("five mistakes I made hiring my first salesperson") works too.
- **Why it works:** honesty builds liking and trust; loss aversion (readers want to avoid the cost); story transportation.
- **Best stage:** TOF and MOF.
- **Evidence it needs:** the real cost (time, money, a client) and the specific change you made.
- **Risks:** humble-brag mistakes ("my mistake was working too hard"); blaming others; sharing confidential details.
- **Example outline:**
  1. Hook with the cost: "Hiring a VP of Sales at 12 customers cost us nine months."
  2. What you believed then.
  3. What happened.
  4. What you'd do instead, as specific steps.
  5. A question for readers at the same stage.

## Teaching formats

### 7. Framework or how-to

- **How it works:** teach a repeatable method in clear steps, ideally with a name that makes it easy to remember and refer to.
- **Why it works:** reciprocity (you gave something useful), practical value (STEPPS), processing fluency (clear steps), and saves for later.
- **Best stage:** MOF.
- **Evidence it needs:** proof the method works (where you used it, what changed) and enough detail to apply it without you.
- **Risks:** generic frameworks anyone could write; naming obvious advice to look original; promising outcomes the method can't guarantee.
- **Example outline:**
  1. Hook: the outcome plus the method's name.
  2. Who it's for and when to use it.
  3. Steps 1–4, each with one concrete example.
  4. The most common mistake when applying it.
  5. Offer the template (in the post, a comment, or a carousel).

### 8. Process breakdown

- **How it works:** show exactly how you or your team do one specific task, end to end, including tools, timings and decisions.
- **Why it works:** concreteness, authority through demonstrated competence, practical value; readers can copy it.
- **Best stage:** MOF.
- **Evidence it needs:** your real process, including the messy parts.
- **Risks:** too abstract to follow; revealing confidential processes; turning it into a product pitch.
- **Example outline:**
  1. "How we write a release note in 20 minutes that customers actually read."
  2. Input: what you start with.
  3. Steps with time spent on each.
  4. A real before/after example.
  5. What you'd change for a smaller team.

### 9. Teardown with borrowed authority

- **How it works:** analyse how a well-known company or person handles something in your area of expertise (their pricing page, onboarding, job ads, sales email), and show what works, what doesn't and why.
- **Why it works:** the famous name supplies attention (authority, triggers); your analysis demonstrates competence without you needing a famous name.
- **Best stage:** MOF.
- **Evidence it needs:** public material (screenshots of public pages), accurate observations, your reasoning.
- **Risks:** unfair or mocking critiques; implying an affiliation; tearing down a competitor without disclosure. Don't tag the company to provoke a reaction.
- **Example outline:**
  1. "I studied [well-known company]'s onboarding emails. Three things every B2B team should copy, and one to avoid."
  2. Screenshot or description of the first item and why it works.
  3. Items two and three.
  4. The one thing to avoid, fairly explained.
  5. How to apply this to your own product.

### 10. Tech stack

- **How it works:** list the tools you use to do a job or run a business, what each is for, and what you'd replace. Tag a company only when it adds context.
- **Why it works:** practical value and saves; social currency (people send it to colleagues choosing tools); tagged vendors sometimes engage.
- **Best stage:** MOF.
- **Evidence it needs:** real usage, costs where you can share them, and why you chose each tool.
- **Risks:** undisclosed affiliate or sponsor relationships (LinkedIn requires "a clear and conspicuous notice" of personal benefit); a stack nobody your size can afford.
- **Example outline:**
  1. "Every tool we use to run a 6-person agency, and what each one costs."
  2. Grouped by job: sales, delivery, finance, communication.
  3. One tool you dropped and why.
  4. What you'd use if starting with no budget.
  5. Disclosure line if any tool pays you.

### 11. List post

- **How it works:** a numbered list of specific items (mistakes, questions, tools, signals) under one clear promise.
- **Why it works:** processing fluency and a bounded payoff; easy to skim; the Ovsiankina tendency to finish what's started keeps people reading.
- **Best stage:** TOF and MOF.
- **Evidence it needs:** each item must be specific and earned; one sentence of explanation or example per item.
- **Risks:** padding to a round number; items so generic they could appear anywhere.
- **Example outline:**
  1. "7 signs your sales pipeline is lying to you."
  2. Items 1–7: the sign, plus one line on what it looks like.
  3. The one you'd fix first.

### 12. Carousel or document post

- **How it works:** a PDF (or PPTX/DOCX) shown as swipeable slides: one idea per slide, a strong first slide that works as the hook, and a summary slide at the end.
- **Why it works:** dwell time (people swipe through), saves (it looks like a resource), processing fluency through visuals; the IKEA effect if it includes a worksheet. In 2025–2026 data, documents had above-median reach for personal profiles ([AuthoredUp, 2026](https://authoredup.com/blog/best-performing-content-on-linkedin)) and the highest engagement rate for company pages ([Socialinsider, 2026](https://cdn.socialinsider.io/documents/linkedin_benchmarks_2026.pdf)).
- **Best stage:** MOF.
- **Evidence it needs:** a framework, process, checklist or data worth studying; readable text on a phone.
- **Risks:** walls of tiny text; padding to more slides; a post caption that just says "swipe". Van der Blom's 2024 report put the sweet spot around a dozen slides, but that's an estimate; use as many as the idea needs.
- **Example outline:**
  1. Slide 1: the promise ("The 5-question pricing audit").
  2. Slide 2: who it's for and why it matters.
  3. Slides 3–7: one question per slide, with an example answer.
  4. Slide 8: how to score yourself.
  5. Slide 9: summary and where to get the template.
  6. Caption: two or three lines that stand alone, plus the key takeaway.

### 13. Template or swipe file

- **How it works:** give the reader something to use immediately: an email template, a checklist, a script, a one-page plan, written in full in the post or attached as a document.
- **Why it works:** reciprocity, practical value, and the IKEA effect (they fill it in). High save and send potential.
- **Best stage:** MOF.
- **Evidence it needs:** a template you've used, with what it achieved.
- **Risks:** gating it behind "comment to get it" (engagement bait and a heavy DM load); templates so generic they're useless.
- **Example outline:**
  1. "The 4-line follow-up email I use after a demo that goes quiet."
  2. The template itself.
  3. Why each line is there.
  4. When not to use it.

### 14. "What I'd do if I started over"

- **How it works:** put yourself in your reader's starting position and lay out the exact plan you'd follow today, step by step, with what you'd skip.
- **Why it works:** self-reference (readers at that stage see themselves), practical value, authority through hindsight; highly saveable.
- **Best stage:** MOF.
- **Evidence it needs:** your own path, including the steps that turned out not to matter.
- **Risks:** survivorship bias (what worked for you may not generalise); ignoring different circumstances. Say what conditions the plan assumes.
- **Example outline:**
  1. "If I were starting as a freelance designer today with no clients, here's my first 90 days."
  2. Weeks 1–2, 3–6, 7–12 with specific actions.
  3. What I'd skip that I wasted time on.
  4. The assumptions behind the plan.

### 15. Customer question answered

- **How it works:** take a real question a customer, candidate or reader asked you and answer it thoroughly in public.
- **Why it works:** the question proves real demand; reciprocity; readers with the same question feel seen (self-reference). Questions near buying decisions (pricing, switching, risks) move readers toward action.
- **Best stage:** MOF and BOF.
- **Evidence it needs:** the real question (anonymised unless you have permission) and a complete answer.
- **Risks:** revealing who asked; answering a different, easier question.
- **Example outline:**
  1. "A CFO asked me this week: 'How do we know if we've outgrown spreadsheets?'"
  2. The short answer.
  3. Three signs, with thresholds you've seen.
  4. What to do at each stage.
  5. An open offer to answer similar questions.

### 16. Comment-to-post repurpose

- **How it works:** turn a substantial comment you wrote (on your post or someone else's) or a great question from a commenter into its own post, developed further.
- **Why it works:** the idea is pre-tested (it already drew a response); recognition for the commenter builds liking and community.
- **Best stage:** MOF.
- **Evidence it needs:** the original exchange; permission before naming or tagging the commenter.
- **Risks:** using someone's words without credit or permission; repeating the comment without adding anything.
- **Example outline:**
  1. "Someone asked on last week's post why we don't offer a free plan. My answer was too long for a comment."
  2. The question in context.
  3. The full answer with reasoning.
  4. Credit to the person who asked (with permission).

## Proof formats

### 17. Case study

- **How it works:** tell the story of one client or project: the starting situation, what you did, and the measured result, including what didn't work.
- **Why it works:** social proof from someone similar to the reader; concreteness; narrative. It's the strongest BOF format because it shows what buying from you looks like.
- **Best stage:** BOF.
- **Evidence it needs:** real numbers, client permission (or anonymisation with disclosure), and the timeframe.
- **Risks:** invented or cherry-picked results; breaching confidentiality; ignoring other factors that contributed. Never fabricate a case study.
- **Example outline:**
  1. Hook with the result and the time: "A 40-person logistics company cut invoice disputes by half in one quarter."
  2. The starting problem in the client's words.
  3. What you changed (two or three moves).
  4. The result, with numbers and caveats.
  5. What the client did themselves (credit them).
  6. A soft CTA for similar companies.

### 18. Before, after, bridge

- **How it works:** describe the reader's current painful state (before), the better state (after), then the bridge: the specific change that gets them there.
- **Why it works:** contrast makes change concrete; loss aversion in the "before"; the bridge supplies practical value. A long-standing copywriting structure.
- **Best stage:** MOF and BOF.
- **Evidence it needs:** a real before and after (yours or a client's), and a bridge that's specific enough to act on.
- **Risks:** exaggerated "before" pain; a bridge that's just "buy my thing".
- **Example outline:**
  1. Before: "Every Monday, our team spent two hours rebuilding the same pipeline report."
  2. After: "Now it updates itself and the meeting is 20 minutes."
  3. Bridge: the three changes, step by step.
  4. What it cost to set up.

### 19. Problem, agitate, solve

- **How it works:** name a specific problem, show what it really costs (agitate, with facts, not fear), then give a solution.
- **Why it works:** self-reference (the reader recognises the problem), loss aversion, then relief. A classic direct-response copywriting formula (its exact origin is unclear).
- **Best stage:** MOF and BOF.
- **Evidence it needs:** proof the problem is common and the cost is real; a solution that works without your product, or an honest pitch.
- **Risks:** agitation becomes fear-mongering; the "solution" is vague. Keep the agitation proportionate and factual.
- **Example outline:**
  1. Problem: "Most job descriptions are written by copying the last one."
  2. Agitate: what that does to who applies, with an example.
  3. Solve: a four-step rewrite process.
  4. Optional BOF line: how you help teams do this.

### 20. Data or insight post

- **How it works:** share a finding from data you have (your customers, your posts, a survey you ran, public data you analysed) with what it means.
- **Why it works:** unexpected plus credible; authority; scarcity (only you have this data); social currency for those who share it.
- **Best stage:** TOF and MOF.
- **Evidence it needs:** the source, the sample size and how you measured, plus a chart if it helps (create_quote_card or a simple chart image).
- **Risks:** small samples presented as universal truths; correlation sold as causation; sharing confidential customer data.
- **Example outline:**
  1. Hook with the surprising finding.
  2. What you looked at and how (sample, period).
  3. Two or three findings.
  4. What it means and what it doesn't.
  5. Invite readers to share whether they see the same.

### 21. Milestone without bragging

- **How it works:** mark a real milestone (a launch, a funding round, a number of customers, a work anniversary) by focusing on what it took, who made it happen, and what it means for the people you serve.
- **Why it works:** social proof and liking; gratitude spreads credit (and the people you thank often share it). Peak-end: end on what's next for customers.
- **Best stage:** BOF (and TOF for your network).
- **Evidence it needs:** the real milestone and its context; permission to name people.
- **Risks:** "humbled and honoured" self-congratulation; vanity metrics; thanking people for being tagged.
- **Example outline:**
  1. The milestone plainly: "We shipped our 1.0 today, 19 months after the first prototype."
  2. The hardest part, honestly.
  3. Two or three people or customers who made it possible, and what they did.
  4. What it means for customers now.
  5. One thing you'd tell someone at the starting line.

### 22. Behind the scenes

- **How it works:** show how something actually gets made or decided: a planning meeting, a messy first draft, a pricing debate, a day in the role.
- **Why it works:** liking and familiarity; curiosity about how others work; authenticity signals that build trust over time.
- **Best stage:** TOF, and BOF when it shows how you work with clients.
- **Evidence it needs:** real material (photos, screenshots, drafts) cleared for sharing.
- **Risks:** confidential information in screenshots; staged "authenticity"; posting about colleagues without consent.
- **Example outline:**
  1. "This is the whiteboard from the meeting where we killed our biggest feature."
  2. What was on it.
  3. The decision and the argument against it.
  4. What happened since.

### 23. Hiring and culture

- **How it works:** describe a role through the actual work, the team and the trade-offs, or share how your team operates (rituals, decisions, how you handle mistakes).
- **Why it works:** unity and identity (candidates see whether they belong); concreteness beats adjectives like "fast-paced"; employees share posts they recognise as true.
- **Best stage:** TOF for culture; BOF when the goal is applications.
- **Evidence it needs:** real details of the job (problems, tools, first 90 days), the salary range where you can share it, and consent from anyone featured.
- **Risks:** generic culture claims; promises you can't keep; featuring employees without consent.
- **Example outline:**
  1. "We're hiring a support engineer who'd rather fix the cause than answer the same ticket twice."
  2. What the first 90 days look like.
  3. What's hard about the role.
  4. Who'd hate it (be honest).
  5. How to apply and the salary range.

## Distribution and community formats

### 24. Strategic tag (with etiquette)

- **How it works:** write something genuinely about or for a specific person or company (credit for an idea, a framework you'd hand them, a thank-you for their work) and tag them because they are part of the content.
- **Why it works:** people read posts they're tagged in; if they respond, the conversation reaches their network; public credit builds relationships (reciprocity, liking).
- **Best stage:** TOF.
- **Evidence it needs:** a real connection between the person and the content.
- **Etiquette:** LinkedIn advises tagging only people "likely to respond", with "max five" as a rule of thumb ([LinkedIn, 2019](https://news.linkedin.com/2019/January/what-s-in-your-linkedin-feed--people-you-know--talking-about-thi)), and lists "tagging for attention" as engagement bait ([LinkedIn](https://www.linkedin.com/blog/content-recommendations-avoid)). Tell the person beforehand when you can; never tag strangers to borrow their audience; never tag people in unrelated posts or comments; accept silence gracefully.
- **Risks:** looking like a reach grab; embarrassing the person; tags people ignore.
- **Example outline:**
  1. "Three years ago a 20-minute call with Priya changed how I price projects."
  2. What she said.
  3. What changed as a result (specifics).
  4. The lesson for others.
  5. Thanks, with the tag.

### 25. Poll (with caveats)

- **How it works:** ask a genuine question with distinct options when the answer is useful to you and the audience, then post the results with your interpretation.
- **Why it works:** a small commitment (voting) with almost no effort; curiosity about how peers voted (social proof). The follow-up post turns votes into insight.
- **Best stage:** TOF.
- **Evidence it needs:** a question whose answer you'll act on or analyse.
- **Caveats:** LinkedIn said in 2022 there were "too many polls" and began showing fewer polls from people you don't know ([LinkedIn, 2022](https://www.linkedin.com/blog/member/product/keeping-your-feed-relevant-and-productive)); reaction-vote polls ("like for A, love for B") are treated as engagement bait. In 2026 data, polls got high reach but low engagement (1.78x reach, 0.37x engagement) ([AuthoredUp, 2026](https://authoredup.com/blog/best-performing-content-on-linkedin)): seen, rarely discussed. Poll voters are self-selected, not a representative sample. This server can't create polls; post them in LinkedIn directly.
- **Risks:** polls used only for reach; leading options; presenting results as research.
- **Example outline:**
  1. Question: "When do you share pricing with a prospect?"
  2. Options: first call, after discovery, in the proposal, only when asked.
  3. A comment from you explaining why you're asking.
  4. Follow-up post a week later: results, what surprised you, caveats.

### 26. Newsletter teaser

- **How it works:** a post that delivers the single most useful idea from a newsletter edition in full, then points to the edition for the rest.
- **Why it works:** reciprocity (value first); curiosity for the remaining ideas; commitment when people subscribe. LinkedIn notifies newsletter subscribers directly ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a517914)), so the teaser's job is to reach non-subscribers.
- **Best stage:** MOF.
- **Evidence it needs:** an edition worth reading, with a standalone idea strong enough to post.
- **Risks:** "New issue out!" posts with no value; withholding the point to force a click.
- **Example outline:**
  1. The edition's best insight as the hook.
  2. The insight explained fully.
  3. "This week's edition also covers…" with two specific items.
  4. Where to read it (link in the post or the first comment).

### 27. Curation or roundup

- **How it works:** collect the best resources, posts, tools or ideas on one topic and add your judgment: why each matters and who it's for.
- **Why it works:** practical value; social currency; goodwill and reciprocity toward the people you credit. Your selection is the value.
- **Best stage:** TOF.
- **Evidence it needs:** you actually read or used each item; working links; credit to creators.
- **Risks:** copying others' content (LinkedIn's User Agreement prohibits copying or distributing others' content without permission, except through sharing features); lists without commentary.
- **Example outline:**
  1. "The five best things I read about pricing this month, and who should read each."
  2. Items with one line of why.
  3. The one you'd read first.

### 28. Open question (genuine crowdsourcing)

- **How it works:** ask your network a specific question you genuinely need answered, give your own current answer, and promise to share what you learn.
- **Why it works:** people like being asked for expertise (liking, commitment); your own answer models the reply you want; comments become content. LinkedIn explicitly allows asking for "thoughts and feedback", unlike asking for likes.
- **Best stage:** TOF.
- **Evidence it needs:** a real question and your own view.
- **Risks:** fake questions ("What's your favourite productivity tip?") that read as bait; not following up.
- **Example outline:**
  1. "I'm rewriting our onboarding for non-technical admins. What's the one thing you wish your last software vendor had told you in week one?"
  2. Your own answer.
  3. Why you're asking and what you'll do with answers.
  4. Follow-up post summarising the best replies (credited, with permission).

## Choosing a format quickly

| Goal of this post | Strong formats |
|---|---|
| Reach new, relevant people | Contrarian take, opinion on news, story with lesson, myth vs reality, data post, strategic tag |
| Earn saves and trust | Framework, process breakdown, carousel, template, "if I started over", tech stack |
| Start conversations | Open question, prediction, poll with follow-up, mistakes and lessons |
| Show proof and convert | Case study, before/after/bridge, customer question answered, milestone, problem-agitate-solve |
| Hire | Hiring and culture, behind the scenes, story about the team |
| Grow a newsletter | Newsletter teaser, data post, framework with "full version in the newsletter" |

Rotate formats so your feed doesn't feel like a template, but keep your topics narrow: variety of form, consistency of subject.
`,
};
