import type { PlaybookTopic } from "./types.js";

export const writing: PlaybookTopic = {
  id: "writing",
  title: "Writing quality and voice",
  summary:
    "How to write posts people finish: readability, line breaks, length bands from data, specificity, a list of AI-writing tells to avoid, capturing someone's voice from samples, an eight-pass editing process and a 20-point self-review rubric.",
  keywords: ["writing", "voice", "tone", "editing", "readability", "length", "line breaks", "formatting", "emoji", "ai writing", "ai tells", "humanize", "rubric", "review", "style", "banned phrases", "draft"],
  body: `## What good looks like

A good LinkedIn post has one clear idea for one clear reader, says something specific and true, and sounds like a particular person talking. Everything in this topic serves those four things.

LinkedIn's own guidance on AI-assisted posts is a useful standard for any post: "Content that feels generic, repetitive, or lacks a clear point of view is less likely to be widely distributed", and "LinkedIn's focus is not on how content is created, but whether it adds value" ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1481496)). It also asks members to "review, edit, and approve" anything AI helped with. In this server, every draft goes to the user for approval before anything is posted.

## Readability

People read most LinkedIn posts on phones, in a feed full of distractions. Make reading effortless:

- **Short sentences.** Mix lengths for rhythm, but keep most under about 20 words.
- **Plain words.** "Use", not "leverage"; "help", not "facilitate". Needlessly complex vocabulary makes writers seem *less* intelligent ([Oppenheimer, 2006](https://doi.org/10.1002/acp.1178)), and easy-to-process text is judged more credible (processing fluency; see the psychology topic).
- **Active voice and concrete subjects.** "We cut the meeting" beats "the meeting was eliminated".
- **One idea per paragraph.**
- **Define or drop jargon.** Write for a smart reader one step behind you.

Reading time: adults read non-fiction silently at about 238 words a minute on average ([Brysbaert, 2019](https://doi.org/10.1016/j.jml.2019.104047)). A 1,300-character post (roughly 200–230 words) takes about a minute to read. Every sentence has to earn that minute.

## Line breaks and formatting

- **Short paragraphs** of one to three lines, separated by blank lines, read well on mobile. AuthoredUp reports posts with many paragraphs had higher reach than posts with few (1.13x for 20+ paragraphs versus 0.70x for 0–5), though it doesn't state a sample size ([AuthoredUp](https://authoredup.com/blog/linkedin-text-formatting)).
- **But don't write "broetry"** (every sentence alone on its own line). It reads as a formula and breaks the flow of an argument.
- **Lists:** numbered when order matters, simple dashes otherwise.
- **Emoji:** functional, not decorative. In AuthoredUp's analysis of 847,000+ posts, posts with one emoji had slightly higher median engagement than posts with none (2.47% vs 2.30%), and results were flat from one to fifteen ([AuthoredUp, 2026](https://authoredup.com/blog/how-to-add-emojis-on-linkedin-posts)). Emoji don't make a post work; they won't usually break one either.
- **Avoid Unicode "bold" or "italic" text** for whole sentences. Screen readers can read it as individual symbols, and it isn't searchable as normal words.
- **Hashtags:** zero to three, specific, at the end (see the algorithm topic).
- **The fold:** the hook must work within the first one or two lines on mobile (see the hooks topic).

## Length bands

LinkedIn allows up to 3,000 characters per post ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a528176)).

**What the data says:** in AuthoredUp's study of 372,126 posts (September 2025 – February 2026), posts of 1,301–2,500 characters had 27% higher median engagement than posts under 400 characters. But when a second study of 709,195 posts compared each post with its own author's usual reach, the differences between length bands shrank to a few percent; only very short text posts (under 400 characters) stood out, at about 14% below the author's usual reach, and text posts did best around 1,200–1,500 characters ([AuthoredUp, 2026](https://authoredup.com/blog/linkedin-character-limit)). In other words, length matters much less than whether the idea deserves it.

| Band | Characters | Best for |
|---|---|---|
| Short | 300–700 | An image or document caption, one sharp observation, an announcement with one key detail |
| Medium | 700–1,500 | Most posts: stories, opinions, a single lesson, a customer question answered |
| Long | 1,500–3,000 | Frameworks, case studies, process breakdowns, "if I started over" plans |

Rule of thumb: write as long as the idea needs, then cut 10–20%.

## Specificity

Specific writing is more credible, more memorable and more obviously yours (see concreteness in the psychology topic).

**The specificity ladder:**

| Vague | General | Specific | Vivid |
|---|---|---|---|
| "We improved onboarding." | "We made onboarding faster." | "We cut onboarding from 14 days to 3." | "We cut onboarding from 14 days to 3 by deleting the kickoff call nobody wanted." |

Ways to climb it:

- Replace adjectives with numbers, names, tools, dates or quotes.
- Show the before and after.
- Use the exact words a customer or colleague said.
- Name the tool, the meeting, the document.
- Give one detail only someone who was there would know.

Keep a proof bank (stories, numbers, quotes, screenshots, client permissions) in growth_profile so specifics are on hand when drafting. Never invent a specific to make a post more vivid; ask for the real one or leave a gap.

## AI-writing tells to avoid

These patterns aren't proof that a machine wrote something. People used them first. But readers now associate them with generic, AI-generated content and scroll past. When a draft has several, rewrite it in plain words. The review_post tool flags many of them mechanically; add the author's own pet hates to the banned phrases in growth_profile.

**Vocabulary:**

- delve, tapestry, testament, realm, landscape ("the ever-evolving landscape of…"), navigate (anything abstract), journey (for anything that isn't travel)
- leverage, unlock, unleash, elevate, empower, supercharge, harness, foster, streamline, revolutionise
- game-changer, cutting-edge, seamless, robust, holistic, pivotal, synergy, paradigm shift
- "In today's fast-paced world", "It's important to note that", "plays a crucial role", "at the end of the day", "a rich tapestry of"

**Structures:**

- The reversal formula, over and over: "It's not X. It's Y." / "This isn't about X. It's about Y."
- Throat-clearing set-ups: "Here's the thing:", "Let me explain.", "Let that sink in.", "Read that again."
- Fragment reveals: "The result? …", "The secret? …", "And honestly? …"
- Things in threes, every time: three adjectives, three short sentences, three-item lists everywhere.
- "Not because X. But because Y."
- Every paragraph ending on a punchline; no sentence allowed to just carry information.
- Stacks of rhetorical questions.
- Perfectly symmetrical lists where every item has the same length and shape.
- A closing paragraph that summarises what was just said ("Ultimately…", "In conclusion…").

**Formatting:**

- Emoji bullets on every line (✅, 🚀, 👉, 💡).
- Heavy em-dash use: readers increasingly treat it as an AI marker; use a full stop, comma or colon instead.
- Bold Unicode text, hashtag walls, a one-word first line followed by blank lines.

**Tone:**

- Uniform enthusiasm; everything is "incredible" or "powerful".
- Hedging everything ("may potentially help to some extent") or the opposite, grand certainty with no evidence.
- Balanced to the point of having no opinion.
- Fake vulnerability ("I almost didn't post this…").
- "As a [job title], I…" openings.

**Endings:**

- "Agree?", "Thoughts?", "What do you think? Let me know in the comments!"
- "Follow me for more", "♻️ Repost to help your network".
- Restating the hook as a moral.

## Capturing a voice from samples

The aim is a draft the author would say out loud without wincing.

1. **Collect five to ten samples written without AI:** old posts that felt right, emails, Slack messages, a talk or podcast transcript, a newsletter. Store them in growth_profile as voice samples.
2. **Build a voice profile** from them:
   - Sentence length and rhythm (short and punchy, or long and flowing?).
   - Vocabulary: favourite words and phrases; words they never use.
   - Formality: contractions, slang, swearing, technical depth.
   - Humour: none, dry, self-deprecating, playful.
   - Point of view: "I", "we" or "you"; how they refer to customers and peers.
   - Certainty: do they say "I think" or "always"? Keep it: never upgrade their certainty.
   - Openings and endings they naturally use.
   - Punctuation habits (exclamation marks, dashes, emoji).
   - Recurring examples, references and beliefs.
3. **Write rules:** five to ten "does" and "doesn't" rules, plus a list of banned phrases.
4. **Draft against the profile.** Then put one paragraph of the draft next to one paragraph of a real sample. Does the rhythm match? Would they use these words?
5. **Learn from edits.** Every change the author makes to a draft is voice data. When they make the same edit twice, turn it into a rule.

Never put experiences, opinions or results in someone's mouth that they haven't given you. A voice can be imitated; a life can't be invented.

## Eight editing passes

Edit in passes, each looking for one kind of problem. It's faster than trying to fix everything at once.

1. **Idea:** is there one clear point? Is it true, non-obvious and useful to the ICP? If not, rethink before polishing.
2. **Structure:** hook, then immediate payoff, then development, then the strongest ending. Cut the warm-up; most first drafts start a paragraph too early.
3. **Evidence:** is every claim supported? Are numbers real, sourced and correctly rounded? Mark anything missing as a gap ("[GAP: client's actual churn figure]") and ask the author.
4. **Specificity:** replace each abstraction you can with a concrete detail.
5. **Voice:** read it aloud. Remove AI tells and banned phrases. Does it sound like the author?
6. **Line edit:** cut 10–20% of words. Shorten sentences. Prefer active verbs. Delete "very", "really", "just", "actually" unless they do work.
7. **Format:** preview it on mobile. Check the fold, paragraph lengths, lists, hashtags, link placement and tags.
8. **Integrity:** no engagement bait, no invented facts, permissions for names and screenshots, disclosure of any paid relationship, nothing confidential.

## Self-review rubric

Use this with the review_post tool: review_post catches mechanical problems (length, the fold, banned phrases, bait patterns), and the rubric covers judgment. Score each criterion 0 (missing or wrong), 1 (acceptable) or 2 (strong).

| # | Criterion | 2 looks like |
|---|---|---|
| 1 | Idea | One clear, non-obvious, true point |
| 2 | Reader | Written for a specific ICP; obvious why they'd care now |
| 3 | Hook | Honest, specific, works within the fold on mobile |
| 4 | Payoff | The body delivers what the hook promised; there's a clear peak |
| 5 | Evidence | Claims supported; numbers real; sources linked where needed |
| 6 | Specificity | Concrete details throughout; no filler generalities |
| 7 | Readability | Short sentences, plain words, scannable on a phone |
| 8 | Voice | Sounds like the author; no AI tells or banned phrases |
| 9 | Ending and CTA | Strong last line; CTA fits the funnel stage; no bait |
| 10 | Integrity | Nothing invented; permissions and disclosures in place |

**Verdict:**

- **Rethink** if Idea or Integrity scores 0, or the total is 10 or less. Go back to the idea; polishing won't fix it.
- **Revise** if any other criterion scores 0, or the total is 11–16. Fix the lowest scores and review again.
- **Ready** if the total is 17 or more with no zeros. Show the final text to the author for approval.

Report the verdict with the two or three changes that would raise the score most, rather than a long list of nitpicks.
`,
};
