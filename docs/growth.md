# Growth guide

linkedin-mcp is more than a way to post. It keeps a strategy for your LinkedIn, plans your content, checks your drafts, makes the visuals, and learns from your real analytics. Your assistant runs the loop; you approve what goes out.

```
 You (once)          Your assistant, every week                          You
 ──────────          ──────────────────────────                          ───
 brand book  ─►  strategy ─► ideas ─► calendar ─► drafts ─► visuals ─►  approve the week
                    ▲                                                        │
                    └──────────── growth_report (what worked) ◄── LinkedIn ◄─┘
```

Everything in this guide stays on your computer except the LinkedIn pages linkedin-mcp reads, and image prompts sent to the image provider you choose.

## Start

Ask your assistant:

> "Interview me and build my LinkedIn strategy."

Clients that show MCP prompts also list it as **start_growth_strategy**. The assistant asks about you in small batches, saves your answers to the brand book, drafts a strategy and asks you to approve it.

Then, each week:

> "Plan my week." *(plan_my_week)*

> "Write the Tuesday post." *(write_post)*

> "Reply to the comments on my latest post." *(reply_to_comments)*

> "Do my 20-minute engagement session." *(engagement_session)*

And once a month:

> "Review my month: what worked and what should change?" *(monthly_growth_review)*

Other prompts: **profile_audit** (checks your profile against the playbook) and **repurpose_post** (turns one post into a carousel, a quote card, a follow-up and more).

## The workspace

| Tool | What it holds |
|---|---|
| `growth_profile` | Your brand book: role, offer, audience (who they are, their pains, desires and objections), goals with targets and dates, a proof bank (stories, wins, numbers, each dated), your voice (samples, words you use, words you never use), topics to avoid, time per week, and brand visuals. It tells the assistant what's still missing. |
| `growth_strategy` | Positioning, 3–5 content pillars (each with a funnel stage and share), funnel mix, cadence, format mix, engagement plan, CTA ladder and KPIs. Drafts are versioned; a strategy is only approved when you say so, and an approved one is never overwritten without your say-so. A readable copy is written to `strategy.md`. |
| `growth_ideas` | The idea bank: thesis, pillar, funnel stage, method, hook options, the evidence needed and where the idea came from (your story, an audience question, a comment, a trend, a past winner). |
| `growth_calendar` | Dated slots from your cadence, each with its idea, draft, media and status (planned, drafted, ready, scheduled, published, skipped). Ready slots carry the exact input for `schedule_post`. The calendar never schedules anything itself. |
| `review_post` | A draft checker (below). |
| `growth_report` | Reads your posts and analytics, keeps a dated history, and reports what works (below). |

Files live in `~/.config/linkedin-mcp/growth/` (`%LOCALAPPDATA%\linkedin-mcp\growth` on Windows), readable only by you.

## Approving a week at once

Planning a week means several posts. Each one still gets its own preview. When they're final, the assistant calls `confirm_batch` with all of them:

- In clients that support MCP dialogs, you see every post in full with its own box to tick. Nothing is ticked by default, and only ticked posts are scheduled.
- The posts go into LinkedIn's own scheduler one at a time in the background (`batch_status` shows each result), so they publish even when your computer is off.
- Each scheduled post counts against the daily cap **of the day it publishes**, and no 7-day stretch can exceed the weekly ceiling. A week planned in one sitting keeps the same pace as daily posting.
- Messages and connection requests are never batched.

This is as autonomous as linkedin-mcp gets: the assistant does the strategy, ideas, drafts and visuals; you spend a few minutes approving the week. It never posts on its own, because an account that posts without its owner is exactly what LinkedIn restricts, and because posts and messages from other people could otherwise steer your assistant.

## The playbook

`get_playbook` (also served as `linkedin-mcp://playbook/<topic>` resources) holds about 24,000 words of sourced, original material:

| Topic | What's in it |
|---|---|
| `algorithm` | How LinkedIn distributes posts. Every claim is labelled: what LinkedIn has said, what large data studies found (with year), and practitioner consensus. |
| `psychology` | Attention and persuasion applied to posts: Cialdini, Berger's STEPPS, the Heaths' SUCCESs, information-gap curiosity, Zeigarnik, peak-end, processing fluency, mere exposure, specificity and more, each with its source and an ethical use. |
| `hooks` | 16 hook types with the mechanism behind each and 48 original examples, the "…see more" fold, and what to avoid. |
| `post-formats` | 28 methods (story, contrarian take, framework, teardown, prediction, carousel, poll…): how, why, funnel stage, evidence needed, risks and an example outline. |
| `content-strategy` | Positioning, ICP, pillars, funnel mix by goal, CTA ladders, cadence by stage, repurposing, weekly rhythm. |
| `profile` | Headline, About, Featured, banner, photo and CTA, with a checklist. |
| `engagement` | Value-adding comments, target accounts, replies, DMs without pitching, and why pods are off-limits. |
| `writing` | Readability, structure, voice capture, AI-writing tells, editing passes and a self-review rubric. |
| `measurement` | Metric definitions, benchmark ranges with sources, small samples, one-variable experiments. |
| `personas` | Founders, B2B sales, job seekers, consultants and creators. |
| `ethics` | What not to do, aligned with LinkedIn's Professional Community Policies. |

Where evidence is weak or second-hand, the playbook says so.

## review_post

A deterministic, explainable check: no AI call, the same draft always gets the same result. Each check passes, warns or fails, with the reason and a fix. Thresholds are labelled by basis: LinkedIn's own rules (**P**), research or standard formulas (**R**), or heuristics (**H**).

| Check | Pass | Basis |
|---|---|---|
| Character limit | under 2,800 (fails over 3,000) | P |
| Hook | first line up to 100 characters; shows what's above the "…see more" fold on desktop (~210 characters) and mobile (~140) | H |
| First line | no throat-clearing; has a number, tension, "you" or a name | H |
| Readability | Flesch reading ease 60+ | R |
| Sentences | average up to 18 words, none over 35 | R |
| Paragraphs and whitespace | short blocks with breathing room | H |
| Length | 300–1,900 characters (shorter is fine with media or a question) | H |
| Specificity | 3+ numbers, names or dates per 100 words | H |
| You vs I | "I" no more than 4× "you" (8× for stories) | H |
| AI tells | em dashes, "delve", "it's not X, it's Y", rhetorical openers, emoji bullets, triads | H |
| Hashtags | 0–3 | H |
| External links | warns, and says the evidence on reach is mixed | H |
| Engagement bait | fails "comment YES", "like if you agree", tag-your-friends asks | P |
| CTA | present and fitting the funnel stage | H |
| Your banned phrases | from your brand book | yours |
| Repeated openings | compared with your recent posts | H |

The score is out of 100. Any failed check caps it at 69, and `ready_to_post` is only true when nothing fails.

## growth_report

Reads your recent posts, a few posts' detailed analytics and your profile analytics (all capped like other reads), stores a dated snapshot, and reports:

- **engagement rate** (reactions + comments + reposts ÷ impressions) and **comment rate** for each post;
- your best and weakest pillars, methods and formats, and posting days and times, compared on medians;
- follower and profile-view trends, and progress against your strategy's KPIs.

It's careful with small numbers: groups under 3 posts aren't ranked, differences under 20% aren't called out, and anything under 5 posts is labelled "directional only". Posts younger than 48 hours are left out of comparisons. `offline: true` reports from stored history without opening LinkedIn.

## Visuals

| Tool | What it makes |
|---|---|
| `create_quote_card` | A branded quote image (1080×1350 or 1080×1080). Free, rendered on your computer. |
| `create_carousel` | A swipeable PDF carousel: title slide, 3–15 content slides (heading, body, bullets or a big number) and a closing slide, plus PNG previews. Free, rendered on your computer. Pass its `document` straight to `create_post`. |
| `generate_image` | A photo or illustration from an AI image model, with your own provider key. May cost money; the result says which provider and, when the provider reports it, the cost. |
| `list_media` | Recent files. |
| `image_providers` | Which providers are set up, and how to set up the others. |

Quote cards and carousels use four built-in themes (`midnight`, `paper`, `cobalt`, `mono`) or your brand: primary and accent colors, one of 11 fonts (`inter`, `manrope`, `space-grotesk`, `ibm-plex-sans`, `dm-sans`, `fraunces`, `playfair-display`, `source-serif-4`, `lora`, `system-sans`, `system-serif`) and a logo. Text that's too long for a slide is shrunk within limits, and the result tells you which slide to shorten. Rendering uses a separate throwaway browser, never your LinkedIn profile.

Generated files go to `~/.config/linkedin-mcp/media/`. That folder is the only part of the data folder that uploads may come from.

### Image providers

Set the key for the provider you want in your MCP client's `env`. Keys are read from the environment only, never written to disk or shown.

| Provider | Environment | Default model | Notes |
|---|---|---|---|
| [Higgsfield](https://docs.higgsfield.ai) | `HF_API_KEY_ID` and `HF_API_KEY_SECRET` (or `HF_CREDENTIALS=id:secret`) | `higgsfield-ai/soul/standard` | Asks Higgsfield for a cost estimate first. |
| [OpenAI](https://developers.openai.com/api/docs/guides/image-generation) | `OPENAI_API_KEY` | `gpt-image-2.5-flare` | |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/image-generation) | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | `gemini-nano-banana-2.1` | |
| [fal.ai](https://fal.ai/docs) | `FAL_KEY` | `fal-ai/flux/dev` | |
| [Replicate](https://replicate.com/docs/reference/http) | `REPLICATE_API_TOKEN` | `black-forest-labs/flux-schnell` | |
| [Ideogram](https://developer.ideogram.ai) | `IDEOGRAM_API_KEY` | `ideogram-4-6` | Good at legible text in images. Quotes the exact cost first. |

With one key set, that provider is used. With several, the first in this table wins unless you choose with `LINKEDIN_MCP_IMAGE_PROVIDER`; `LINKEDIN_MCP_IMAGE_MODEL` picks a different model. Your assistant can also pass `provider` and `model` per image. Model names change often; if a provider rejects the default, set the model its docs list. `LINKEDIN_MCP_IMAGE_TIMEOUT_SECONDS` (default 300) sets how long to wait; slow jobs return a `job_id` to collect later.

Downloads from providers are limited to public HTTPS addresses (checked on every redirect, and pinned to the checked address), size-limited and checked for a real image signature before saving.

### Brand settings

| Environment | `config.json` (`brand`) | What it sets |
|---|---|---|
| `LINKEDIN_MCP_BRAND_THEME` | `theme` | `midnight`, `paper`, `cobalt` or `mono` |
| `LINKEDIN_MCP_BRAND_PRIMARY` | `primaryColor` | Background or main color, e.g. `#14213d` |
| `LINKEDIN_MCP_BRAND_ACCENT` | `accentColor` | Highlights. You're warned if it's too faint to read. |
| `LINKEDIN_MCP_BRAND_FONT` | `font` | One of the 11 fonts above |
| `LINKEDIN_MCP_BRAND_LOGO` | `logoPath` | A PNG or JPG logo |
| | `name`, `handle`, `headshotPath` | Shown on quote cards and carousel slides |
| `LINKEDIN_MCP_WEB_FONTS` | `webFonts` | `false` to use system fonts only (no font download) |

You can also store brand visuals in your brand book with `growth_profile`, and pass `brand` or `theme` to each tool.
