<p align="center">
  <img src="docs/assets/hero.png" alt="linkedin-mcp: your AI drafts it, you approve it, then it posts. A schedule_post preview with an Approved stamp." width="100%">
</p>

<h1 align="center">LinkedIn MCP Server</h1>

<p align="center"><b>Free, open-source LinkedIn automation and growth for Claude, ChatGPT, Cursor, Gemini, Copilot and any AI agent.</b><br>
Build a LinkedIn content strategy, plan your week, write and design posts and carousels, schedule them, reply to comments and learn from your analytics, all from your AI assistant, with your approval before anything is sent.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@danishfareed/linkedin-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@danishfareed/linkedin-mcp?color=1f6feb"></a>
  <a href="https://github.com/danishfareed/Linkedin-MCP/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/danishfareed/Linkedin-MCP/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-1f6feb">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-1f6feb"></a>
  <img alt="53 MCP tools" src="https://img.shields.io/badge/MCP%20tools-53-1f6feb">
  <img alt="Works with any MCP client" src="https://img.shields.io/badge/works%20with-any%20MCP%20client-1f6feb">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> &nbsp;·&nbsp;
  <a href="#what-you-can-ask">What you can ask</a> &nbsp;·&nbsp;
  <a href="#grow-not-just-post">Growth</a> &nbsp;·&nbsp;
  <a href="#works-with-every-ai-assistant">AI clients</a> &nbsp;·&nbsp;
  <a href="#complete-tool-reference">Tools</a> &nbsp;·&nbsp;
  <a href="#safety">Safety</a> &nbsp;·&nbsp;
  <a href="#configuration">Settings</a> &nbsp;·&nbsp;
  <a href="#faq">FAQ</a>
</p>

**LinkedIn MCP** is a free, open-source [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets your AI assistant run **your own** LinkedIn account. Connect LinkedIn to Claude, ChatGPT, Cursor, VS Code Copilot, Gemini CLI, Windsurf, Cline or any MCP client, then ask it to draft and publish posts, **schedule LinkedIn posts** with LinkedIn's own scheduler, read your **LinkedIn analytics**, answer comments, keep up with notifications and messages, search jobs, and look up people and companies. It's also a complete growth system: it keeps your brand book and strategy, plans a content calendar, checks your drafts against proven methods, makes images and carousels, and learns from your real analytics. It's built for creators, founders and job seekers, and it runs on your computer through a real Chrome browser that you sign in to yourself. No API keys, no paid service, no password stored.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Animated example: the user asks for a scheduled post, the assistant shows a preview, the user approves, and the post is scheduled on LinkedIn." width="100%">
</p>

## Everything it does

| Area | What your AI assistant can do on LinkedIn |
|---|---|
| **Posting and scheduling** | Publish text, image and PDF carousel posts; schedule posts with LinkedIn's own scheduler; list and delete scheduled or published posts; optionally post through LinkedIn's official API with your own developer app. |
| **Analytics** | Read impressions, reach, reactions, comments, reposts, saves and sends for your posts, viewer demographics, followers, profile views and search appearances. |
| **Engagement** | Read your feed and notifications, search posts, read comments, react, comment and reply to comments. |
| **Research** | Read profiles, someone's recent posts, company pages and company posts; search people and companies (capped, no bulk export). |
| **Jobs** | Search jobs by keywords, location, date, remote/hybrid/on-site, experience and Easy Apply; read job details; list saved jobs. Never applies for you. |
| **Network and messages** | Send connection requests, accept or ignore invitations, read your inbox and conversations, and message connections. |
| **Growth system** | Keep a brand book and an approved content strategy, an idea bank and a content calendar; score drafts with an explainable checker; follow a sourced playbook of hooks, formats and psychology; learn your best pillars, formats and posting times from your own analytics. |
| **Visuals** | Render branded quote cards and PDF carousels on your computer, and generate AI images with Higgsfield, OpenAI, Gemini, fal.ai, Replicate or Ideogram using your own key. |
| **Safety** | Preview and approval for every send (in a client dialog where supported), checked results, daily and weekly caps, a warm-up, working hours, read-only and dry-run modes, an automatic pause on security checks and rate limits, and an audit log. |

## Works with every AI assistant

linkedin-mcp is a standard [MCP](https://modelcontextprotocol.io) server. It runs locally over stdio (or local Streamable HTTP), and its tool schemas use only the JSON Schema features every major client accepts.

<!-- clients:start -->
| AI client | Where linkedin-mcp goes | Notes |
|---|---|---|
| [Claude Desktop](docs/clients.md#claude-desktop) | Settings → Developer → Edit Config (`claude_desktop_config.json`) |  |
| [Claude Code](docs/clients.md#claude-code) | `claude mcp add linkedin --scope user -- npx -y @danishfareed/linkedin-mcp` | Approval dialogs supported |
| [ChatGPT desktop and Codex](docs/clients.md#chatgpt-desktop-app-and-codex) | Settings → MCP servers, or `~/.codex/config.toml` | Approval dialogs supported |
| [Cursor](docs/clients.md#cursor) | `~/.cursor/mcp.json` or `.cursor/mcp.json` | Approval dialogs supported |
| [VS Code (GitHub Copilot)](docs/clients.md#vs-code-github-copilot) | `~/.copilot/mcp-config.json` or `.mcp.json` | Set `"timeout": 60000` |
| [Visual Studio](docs/clients.md#visual-studio) | `%USERPROFILE%\.mcp.json` or `<solution>\.mcp.json` |  |
| [JetBrains AI Assistant](docs/clients.md#jetbrains-ai-assistant) | Settings → Tools → AI Assistant → Model Context Protocol |  |
| [Junie (JetBrains)](docs/clients.md#junie) | `~/.junie/mcp/mcp.json` | 100-tool limit: use a preset |
| [Devin Desktop (formerly Windsurf)](docs/clients.md#devin-desktop-formerly-windsurf) | `~/.config/devin/mcp_config.json` |  |
| [Cline](docs/clients.md#cline) | `cline_mcp_settings.json` |  |
| [Kilo Code](docs/clients.md#kilo-code) | `~/.config/kilo/kilo.jsonc` | Set `"timeout": 60000` |
| [Continue](docs/clients.md#continue) | `~/.continue/config.yaml` | Agent mode |
| [Zed](docs/clients.md#zed) | `settings.json` → `context_servers` |  |
| [Goose](docs/clients.md#goose) | `~/.config/goose/config.yaml` | Approval dialogs supported |
| [Gemini CLI](docs/clients.md#gemini-cli) | `~/.gemini/settings.json` |  |
| [Kiro (formerly Amazon Q Developer CLI)](docs/clients.md#kiro-formerly-amazon-q-developer-cli) | `~/.kiro/settings/mcp.json` | Approval dialogs supported |
| [Warp](docs/clients.md#warp) | Settings → Agents → MCP servers |  |
| [LM Studio](docs/clients.md#lm-studio) | `~/.lmstudio/mcp.json` | Use `lite` for small local models |
| [Jan](docs/clients.md#jan) | Settings → MCP Servers | Raise the tool timeout to 60 s |
| [Msty Studio, 5ire, Cherry Studio, BoltAI](docs/clients.md#msty-studio) | Each app's MCP settings | Use a small toolset with local models |
| [n8n](docs/clients.md#n8n) | MCP Client Tool node | Uses local HTTP mode |
| [Claude Agent SDK, OpenAI Agents SDK, MCP SDKs](docs/clients.md#for-developers) | In your code |  |
| **Any other MCP client** | Command `npx`, arguments `-y @danishfareed/linkedin-mcp` | |
<!-- clients:end -->

ChatGPT on the web and claude.ai can't reach a server on your computer; use their desktop apps. Every client's exact config, file paths for each OS, tool limits and timeouts: **[docs/clients.md](docs/clients.md)**. If your client caps the number of tools, set `LINKEDIN_MCP_TOOLSETS` (see [Configuration](#configuration)).

## Why it's different

- **It's a growth system, not just a poster.** It interviews you, keeps a strategy and content calendar, scores drafts with an explainable checker, draws on a sourced playbook of methods and psychology, and reports which pillars, formats and posting times actually work for you.
- **It makes the visuals.** Branded quote cards and PDF carousels rendered on your computer for free, and AI images through Higgsfield, OpenAI, Gemini, fal, Replicate or Ideogram with your own key.
- **It does the things creators actually do.** Publish and schedule posts (text, images, PDF carousels), read post and profile analytics, reply to comments, react, manage invitations and messages. Most LinkedIn MCP servers only read.
- **You approve every send.** Each post, comment, reaction, message or invitation comes back as a preview first. In clients that support it, you approve in a dialog the AI can't click for you.
- **It tells you what really happened.** After sending, it checks LinkedIn and reports `sent`, `unconfirmed` (don't retry) or `not_sent` (safe to retry), instead of assuming the click worked.
- **It keeps you at a human pace.** Daily and weekly caps, a 14-day warm-up, working hours, one action at a time, and an automatic pause the moment LinkedIn shows a security check or starts rate-limiting.
- **It installs in one line and stays installed.** `npx`, no Python. Dependencies are pinned and shrinkwrapped, so an upstream release can't break your setup overnight.

## Quick start

**1. Sign in once.** A Chrome window opens on LinkedIn. Sign in as usual, including 2FA, and the window closes by itself.

```bash
npx @danishfareed/linkedin-mcp login
```

**2. Add it to your AI client.** Most clients use this JSON:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@danishfareed/linkedin-mcp"]
    }
  }
}
```

| Client | Where it goes |
|---|---|
| **Claude Desktop** | Settings → Developer → Edit Config (`claude_desktop_config.json`) |
| **Claude Code** | `claude mcp add linkedin --scope user -- npx -y @danishfareed/linkedin-mcp` |
| **Cursor** | `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project |
| **VS Code (Copilot)** | `~/.copilot/mcp-config.json`, or `.mcp.json` in a workspace |
| **Devin Desktop (formerly Windsurf)** | `~/.config/devin/mcp_config.json` |
| **Cline** | MCP Servers → Configure → `cline_mcp_settings.json` |
| **ChatGPT desktop** | Settings → MCP servers → Add server → STDIO (or `~/.codex/config.toml`) |

Paths for every OS, local HTTP mode and timeout settings are in **[docs/clients.md](docs/clients.md)**.

**3. Check it.** Restart your client and ask *"Check my LinkedIn session status."* To check every page linkedin-mcp reads:

```bash
npx @danishfareed/linkedin-mcp doctor
```

**4. Optional: post through LinkedIn's official API.** If you have (or create) a LinkedIn developer app, posts can publish through LinkedIn's own API instead of the browser. See [Official API posting](#official-api-posting-optional).

> [!TIP]
> **Try it with nothing sent.** Add `"env": { "LINKEDIN_MCP_DRY_RUN": "true" }` to the config above: every action is previewed and simulated. Or use `LINKEDIN_MCP_READ_ONLY=true` to hide every tool that sends something.

> [!NOTE]
> **Early release (0.1).** The safety layer is tested end to end. The parts that read and click LinkedIn's pages are new, and LinkedIn changes its layout often, so some tools will need fixes as more people use them. Run `doctor` to check yours and [report anything broken](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml).

## Official API posting (optional)

By default linkedin-mcp does everything through the browser. If you connect your own LinkedIn developer app, `create_post` publishes through LinkedIn's official [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) instead: no page layout to break, a definite result from LinkedIn, and the action you take most often goes through the route LinkedIn provides for it. Everything else (scheduling with LinkedIn's own scheduler, analytics, comments, messages) stays on the browser.

```bash
npx @danishfareed/linkedin-mcp connect-api
```

The command walks you through it:

1. Create an app at [linkedin.com/developers/apps/new](https://www.linkedin.com/developers/apps/new) and link it to a LinkedIn Page you admin (a Page admin verifies the link).
2. Under **Products**, add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**. Both are self-serve.
3. Under **Auth**, add the redirect URL `http://localhost:8765/callback`, then paste the Client ID and Client Secret when asked.
4. Click **Allow** on LinkedIn's page. The connection is saved in your data folder, readable only by you.

Already have a developer app from another tool? Reuse it; just make sure the redirect URL above is listed. Your assistant can also start the connection with the `connect_linkedin_api` tool once the app's ID and secret are in the config.

| `LINKEDIN_MCP_POST_VIA` | What happens |
|---|---|
| `auto` (default) | API when connected, browser otherwise. The preview says which. |
| `api` | Always the API. If it isn't connected, posting stops with a clear error instead of falling back. |
| `browser` | Never the API. |

Good to know:

- LinkedIn's connections last 60 days and can't be refreshed by ordinary apps. `session_status` and `status` show the days left; run `connect-api` again to renew. When it lapses in `auto` mode, posts go back through the browser.
- Text and images (one or several) go through the API. PDF carousels and scheduled posts use the browser.
- Previews, your approval, caps, working hours and the audit log apply exactly the same way.
- `disconnect-api` deletes the saved connection.

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.png">
  <img alt="Your AI client talks MCP to linkedin-mcp on your computer, which drives a Chrome profile you signed in to; LinkedIn sees one person using their own account. Every send goes through preview, your approval, checks, human pace, the guard and the audit log." src="docs/assets/how-it-works-light.png" width="100%">
</picture>

Everything runs on your computer. linkedin-mcp drives a real Chrome window with your own saved session, one action at a time. Nothing leaves your machine except the browser's normal traffic to LinkedIn: no telemetry, no hosted component.

## Grow, not just post

<details open>
<summary><b>The weekly loop</b></summary>

```
 You (once)          Your assistant, every week                          You
 ──────────          ──────────────────────────                          ───
 brand book  ─►  strategy ─► ideas ─► calendar ─► drafts ─► visuals ─►  approve the week
                    ▲                                                        │
                    └──────────── growth_report (what worked) ◄── LinkedIn ◄─┘
```

</details>

1. **"Interview me and build my LinkedIn strategy."** Your assistant asks about you, your audience, offer, goals and proof in small batches, saves it all in a local brand book, and drafts a strategy: positioning, content pillars, funnel mix, cadence and KPIs. You approve it.
2. **"Plan my week."** It turns the strategy and idea bank into a calendar, drafts each post with a method and hook from the playbook, runs every draft through `review_post`, and makes a carousel or image where it helps.
3. **Approve the week in one sitting.** Every post has its own preview. In clients with dialogs you tick each one, and LinkedIn's own scheduler publishes them, even with your computer off.
4. **"Review my month."** `growth_report` reads your analytics, keeps a history, and tells you what's working, with honest confidence levels on small samples. The strategy adapts.

Clients that show MCP prompts list these as `start_growth_strategy`, `plan_my_week`, `write_post`, `engagement_session`, `profile_audit`, `monthly_growth_review`, `repurpose_post` and `reply_to_comments`. The playbook behind them is about 24,000 words of sourced material: how LinkedIn distributes posts (every claim labelled by evidence), persuasion psychology, 48 hooks, 28 post formats, strategy, profile, engagement, writing and measurement.

Full guide, including image provider setup and brand settings: **[docs/growth.md](docs/growth.md)**.

## What you can ask

**Posting and scheduling**
- "Turn these meeting notes into a LinkedIn post and schedule it for Tuesday at 9am."
- "Post this carousel PDF with the title 'Five pricing mistakes' and a short intro."
- "What do I have scheduled this week?"

**Analytics**
- "How did my last five posts do? Which one got the most impressions per reaction?"
- "Who saw my post about hiring? Show me the demographics."
- "How many profile viewers and search appearances did I get this week?"

**Engagement**
- "Summarise the comments on my latest post and draft a reply to each question."
- "What's new in my notifications? Anything I should respond to?"
- "Find posts from this week about MCP servers, newest first, and suggest three I could add something useful to."

**Strategy and visuals**
- "Interview me and build my LinkedIn strategy. My goal is 20 qualified leads a quarter."
- "Score this draft and fix whatever fails."
- "Turn my last post into a 6-slide carousel in my brand colors."
- "Generate a header image for Thursday's post with Higgsfield."

**Jobs, research and network**
- "Find remote senior product designer roles posted this week and summarise the three best fits."
- "Look up the founders of Northwind Labs and tell me what they've posted about recently."
- "Who's sent me connection requests? Accept the ones who work in product."
- "Read my conversation with Chris and draft a reply suggesting Thursday."

## Complete tool reference

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tools-dark.png">
  <img alt="All 53 linkedin-mcp tools, grouped: posting and analytics, research, jobs, engagement, network and messages, visuals, growth, session and safety. Tools that send something are marked; they need your approval first." src="docs/assets/tools-light.png" width="100%">
</picture>

linkedin-mcp has 53 MCP tools. All of them return compact JSON. Tools that send something return a preview and a `confirmation_token`; nothing is sent until `confirm_action` (or `confirm_batch`) is called with it after you approve. Every parameter below is generated from the server's own definitions.

<!-- generated:tools:start (npm run docs) -->
<details>
<summary><b>Session, safety and approval</b> (12 tools, toolset <code>core</code>)</summary>

#### `session_status`

**Check LinkedIn session status.** Whose LinkedIn account linkedin-mcp is set up for, whether automation is paused, warm-up status, read-only and dry-run modes. By default it answers from saved state without opening the browser (and checks the session cookie if the browser is already open). Set verify=true to load your profile and confirm you're signed in (uses one page load).

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `verify` | boolean | no | `false` |  |

#### `connect_linkedin_api`

**Connect LinkedIn's official API.** Optional. Connects the user's own LinkedIn developer app so posts publish through LinkedIn's official API instead of the browser. Opens LinkedIn's consent page in the user's browser and returns straight away; after the user clicks Allow, session_status shows the connection. Needs the app's Client ID and Secret in the config (the `connect-api` terminal command walks through creating the app). Connections last 60 days.

*Calls an outside service.*

No parameters.

#### `get_limits`

**Get usage limits.** Today's and this week's usage against each safety cap, the caps in effect (halved during warm-up), hard ceilings and reset times.

*Reads LinkedIn.*

No parameters.

#### `set_limits`

**Change daily limits.** Change daily caps. You can lower any cap freely and raise it up to its hard ceiling, never above. Saved to config.json in the linkedin-mcp data folder. Warm-up still halves caps for the first 14 days.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post` | integer | no |  | Posts (published or scheduled) per day (default 2, max 3). 0–3. |
| `comment` | integer | no |  | Comments and replies per day (default 15, max 30). 0–30. |
| `reaction` | integer | no |  | Reactions per day (default 40, max 100). 0–100. |
| `connection` | integer | no |  | Connection requests per day (default 10, max 20). 0–20. |
| `message` | integer | no |  | Messages per day (default 15, max 30). 0–30. |
| `profile_view` | integer | no |  | Profile views (research) per day (default 40, max 80). 0–80. |
| `search` | integer | no |  | Searches per day (default 15, max 30). 0–30. |
| `page_load` | integer | no |  | Page loads overall per day (default 300, max 500). 0–500. |

#### `get_audit_log`

**Get the audit log.** Recent write actions (posts, comments, reactions, messages, invitations, deletions), guard trips and pauses, newest first. Message text is never stored, only a hash.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `50` | 1–200. |

#### `pause`

**Pause all LinkedIn automation.** Stop all LinkedIn actions until resume is called, or for a number of minutes.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `minutes` | integer | no |  | 1–43200. |
| `reason` | string | no |  | up to 200 characters. |

#### `resume`

**Resume LinkedIn automation.** Resume after a pause. If LinkedIn showed a security check, only resume after the user has resolved it themselves in a visible window (`npx @danishfareed/linkedin-mcp login`).

*Runs on your computer.*

No parameters.

#### `confirm_action`

**Confirm a previewed action.** Execute an action previewed by another tool (post, schedule, comment, reply, reaction, connection request, invitation response, message, deletion). Only call this after the user has seen the preview and clearly said yes. Tokens are single-use and expire after 10 minutes. If the AI client supports it, the user is also asked to approve in a dialog, and declining there sends nothing.

*Sends approved previews.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `confirmation_token` | string | yes |  |  |

#### `cancel_action`

**Cancel a previewed action.** Discard a preview's confirmation token when the user decides not to go ahead.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `confirmation_token` | string | yes |  |  |

#### `confirm_batch`

**Confirm several previewed actions.** Approve up to 10 previewed actions in one go: scheduled posts (a planned week), comments, replies to comments and reactions. Each item must already have its own preview and confirmation_token from schedule_post, comment_on_post, reply_to_comment or react_to_post. Only call this after the user has seen every preview in full and approved each one; never include an item they haven't seen. If the AI client supports dialogs, the user ticks each item to send and unticked items are discarded. Items run one at a time in the background; call batch_status for results. Messages and connection requests can't be batched.

*Sends approved previews.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `confirmation_tokens` | string[] | yes |  | 2–10 items. |

#### `batch_status`

**Check a batch of actions.** Progress and results of a confirm_batch job: each item's status (sent, unconfirmed, not_sent, failed, skipped, not_started) and details.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `job_id` | string | yes |  |  |

#### `get_my_profile`

**Read your own profile.** Read the signed-in user's own LinkedIn profile. Does not count as a research profile view.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `sections` | array of `about` \| `experience` \| `education` \| `skills` \| `certifications` \| `languages` \| `volunteering` \| `projects` | no | `["about","experience","education"]` | Which profile sections to read. |

</details>

<details>
<summary><b>Posting, scheduling and analytics</b> (7 tools, toolset <code>posting</code>)</summary>

#### `create_post`

**Create a LinkedIn post.** Prepare a LinkedIn post (text, optional images or a PDF carousel) to publish now from the user's account. Counts against the daily post limit. Posts go through LinkedIn's official API when the user has connected their own developer app (connect-api), otherwise through the browser; the preview says which.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `text` | string | yes |  | Post text, up to 3000 characters. Line breaks are kept. |
| `images` | string[] | no |  | Up to 9 absolute paths to JPG, PNG or GIF images. Cannot be combined with document. 0–9 items. |
| `document` | object | no |  | fields: `path`, `title`. |
| `visibility` | `anyone` \| `connections` | no | `anyone` | Who can see the post. |

#### `schedule_post`

**Schedule a LinkedIn post.** Prepare a post to be scheduled with LinkedIn's own scheduler, so it publishes even when this computer is off. publish_at is ISO 8601; without a timezone it means the user's local time. Times round up to the next 15 minutes. Allowed window: 30 minutes to 90 days ahead. Scheduled posts count against the daily post limit.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `text` | string | yes |  | Post text, up to 3000 characters. Line breaks are kept. |
| `images` | string[] | no |  | Up to 9 absolute paths to JPG, PNG or GIF images. Cannot be combined with document. 0–9 items. |
| `document` | object | no |  | fields: `path`, `title`. |
| `visibility` | `anyone` \| `connections` | no | `anyone` | Who can see the post. |
| `publish_at` | string | yes |  | When to publish, e.g. 2026-12-01T09:30 (local) or 2026-12-01T09:30:00Z. |

#### `list_scheduled_posts`

**List scheduled posts.** List posts waiting in LinkedIn's scheduler, with their scheduled time and text.

*Reads LinkedIn.*

No parameters.

#### `delete_post`

**Delete one of your posts.** Prepare deletion of one of the user's own LinkedIn posts. Deleting cannot be undone.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  | URL of your post, e.g. https://www.linkedin.com/feed/update/urn:li:activity:…/. |

#### `get_my_posts`

**Get your recent posts.** The user's own recent posts (at most 20) with impressions, reactions, comments and reposts where LinkedIn shows them. complete is false, with a note, when fewer posts than asked for could be loaded.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `10` | 1–20. |

#### `get_post_analytics`

**Get analytics for one of your posts.** Impressions, members reached, profile views, followers gained, reactions, comments, reposts, saves, sends and top viewer demographics for one of the user's own posts.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  | URL of your post. |

#### `get_profile_analytics`

**Get your profile analytics.** Post impressions, followers, profile viewers and search appearances from the user's LinkedIn dashboard, with the trend LinkedIn shows for each.

*Reads LinkedIn.*

No parameters.

</details>

<details>
<summary><b>Feed, comments and reactions</b> (7 tools, toolset <code>engagement</code>)</summary>

#### `get_feed`

**Read your LinkedIn feed.** Recent posts from the user's home feed (author, text, reactions, comments, reposts, post URL), at most 20. Promoted posts are skipped. complete is false, with a note, when fewer posts than asked for could be loaded.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `10` | 1–20. |

#### `search_posts`

**Search LinkedIn posts.** Search public LinkedIn posts by keywords (at most 20 results), optionally limited to the past 24 hours, week or month, sorted by relevance or latest, and filtered to posts with photos, videos or documents. complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily search limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `keywords` | string | yes |  | up to 200 characters. |
| `date_posted` | `past-24h` \| `past-week` \| `past-month` | no |  |  |
| `sort` | `relevance` \| `latest` | no | `relevance` | relevance (LinkedIn's default) or latest (newest first). |
| `content_type` | `photos` \| `videos` \| `documents` | no |  | Only posts that contain photos, videos or documents. |
| `limit` | integer | no | `10` | 1–20. |

#### `get_post_comments`

**Read comments on a post.** Comments and replies on a LinkedIn post. Each comment has an id you can pass to reply_to_comment.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  |  |
| `limit` | integer | no | `20` | 1–50. |

#### `react_to_post`

**React to a post.** React to a LinkedIn post (like, celebrate, support, love, insightful, funny). It never removes an existing reaction. Counts against the daily reaction limit. By default this returns a preview and a confirmation_token; show it to the user and call confirm_action only after they approve. If the user turned off reaction confirmations in their config, it reacts directly.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  |  |
| `reaction` | `like` \| `celebrate` \| `support` \| `love` \| `insightful` \| `funny` | no | `like` |  |

#### `comment_on_post`

**Comment on a post.** Prepare a comment on a LinkedIn post. Counts against the daily comment limit.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  |  |
| `text` | string | yes |  | Comment text, up to 1250 characters. |

#### `reply_to_comment`

**Reply to a comment.** Prepare a reply to a comment on a LinkedIn post. Get comment_id from get_post_comments. Counts against the daily comment limit.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `post_url` | string | yes |  |  |
| `comment_id` | string | yes |  | The comment's id from get_post_comments (urn:li:comment:…). |
| `text` | string | yes |  | Comment text, up to 1250 characters. |

#### `get_notifications`

**Read your notifications.** Recent LinkedIn notifications: comments, reactions, mentions, profile views and more, with links.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `15` | 1–30. |

</details>

<details>
<summary><b>Profiles, companies and people search</b> (6 tools, toolset <code>research</code>)</summary>

#### `get_person_profile`

**Read a LinkedIn profile.** Read one person's LinkedIn profile: name, headline, location and the sections you ask for. Counts against the daily profile-view limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `profile` | string | yes |  | Profile URL or username, e.g. https://www.linkedin.com/in/jane-doe/ or jane-doe. |
| `sections` | array of `about` \| `experience` \| `education` \| `skills` \| `certifications` \| `languages` \| `volunteering` \| `projects` | no | `["about","experience","education"]` | Which profile sections to read. |

#### `get_person_posts`

**Read a person's recent posts.** A person's recent LinkedIn posts and reposts, newest first, at most 20: text, when (relative, e.g. "3d"), reaction, comment and repost counts, and each post's URL. kind says whether it's their own post or a repost. Their comments and reactions on other people's posts are left out. complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily profile-view limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `profile` | string | yes |  | Profile URL or username, e.g. https://www.linkedin.com/in/jane-doe/ or jane-doe. |
| `limit` | integer | no | `10` | 1–20. |

#### `get_company_profile`

**Read a company page.** Read a LinkedIn company page: overview, website, industry, size, headquarters, founding year, specialties and followers. Counts against the daily profile-view limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `company` | string | yes |  | Company URL or slug, e.g. https://www.linkedin.com/company/acme/ or acme. |

#### `get_company_posts`

**Read a company's recent posts.** A company's recent LinkedIn posts from its Posts tab, in the order LinkedIn shows them, at most 20: text, when (relative), reaction, comment and repost counts, and each post's URL. complete is false, with a note, when fewer posts than asked for could be loaded. Counts against the daily profile-view limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `company` | string | yes |  | Company URL or slug, e.g. https://www.linkedin.com/company/acme/ or acme. |
| `limit` | integer | no | `10` | 1–20. |

#### `search_people`

**Search for people.** Search LinkedIn for people. Returns at most 10 results (name, headline, location, profile URL, connection degree): one page, for finding a specific person, not for building lists. Counts against the daily search limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `keywords` | string | no | `` | up to 200 characters. |
| `filters` | object | no | `{}` | fields: `network`, `title`, `company`, `first_name`, `last_name`, `school`. |
| `limit` | integer | no | `10` | 1–10. |

#### `search_companies`

**Search for companies.** Search LinkedIn for companies by keywords. Returns at most 10 results. Counts against the daily search limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `keywords` | string | yes |  | up to 200 characters. |
| `limit` | integer | no | `10` | 1–10. |

</details>

<details>
<summary><b>Jobs</b> (3 tools, toolset <code>jobs</code>)</summary>

#### `search_jobs`

**Search LinkedIn jobs.** Search LinkedIn job postings. Returns one page, at most 25 jobs (job_id, title, company, location, workplace, posted, salary if shown, easy_apply, url) plus complete/note when fewer than asked for could be read. Pass a job_id or url to get_job_details for the full posting. Read-only: it never applies to jobs. Counts against the daily search limit.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `keywords` | string | yes |  | Job title, skill or company, e.g. "backend engineer". up to 200 characters. |
| `location` | string | no |  | City, region or country as you'd type it on LinkedIn, e.g. "Lisbon, Portugal" or "Remote". up to 100 characters. |
| `date_posted` | `past-24h` \| `past-week` \| `past-month` | no |  | Only jobs posted in the past 24 hours, week or month. |
| `workplace` | array of `on-site` \| `remote` \| `hybrid` | no |  | Any of on-site, remote, hybrid. 0–3 items. |
| `experience` | array of `internship` \| `entry` \| `associate` \| `mid-senior` \| `director` \| `executive` | no |  | Any of internship, entry, associate, mid-senior, director, executive. 0–6 items. |
| `easy_apply_only` | boolean | no | `false` | Only jobs with LinkedIn Easy Apply. |
| `limit` | integer | no | `10` | 1–25. |

#### `get_job_details`

**Read a job posting.** Full details of one LinkedIn job: title, company and company URL, location, workplace type, employment type, when it was posted, applicant count and salary when LinkedIn shows them, the description (trimmed to about 4000 characters; description_truncated says when it was cut), and how to apply (easy_apply, external with apply_url when exposed, or closed). Read-only: it never clicks Apply or Save.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `job` | string | yes |  | Job URL (https://www.linkedin.com/jobs/view/1234567890/, or any jobs link with currentJobId=…) or the numeric job id. |

#### `get_saved_jobs`

**List your saved jobs.** Jobs the user saved on LinkedIn (first page only, at most 25): job_id, title, company, location, posted, whether they already applied and whether the job is closed, plus complete/note. Read-only.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `10` | 1–25. |

</details>

<details>
<summary><b>Invitations and messages</b> (6 tools, toolset <code>network</code>)</summary>

#### `send_connection_request`

**Send a connection request.** Prepare a connection request, optionally with a note (up to 200 characters, or 300 with Premium). Counts against the daily connection limit.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `profile` | string | yes |  | Profile URL or username. |
| `note` | string | no |  | up to 300 characters. |

#### `list_invitations`

**List connection invitations.** Pending connection invitations you've received or sent. Each received invitation has an id for respond_to_invitation.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `direction` | `received` \| `sent` | no | `received` |  |
| `limit` | integer | no | `20` | 1–50. |

#### `respond_to_invitation`

**Accept or ignore an invitation.** Prepare accepting or ignoring a received connection invitation. Get the id from list_invitations.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `id` | string | yes |  | Invitation id (the inviter's username) from list_invitations. |
| `action` | `accept` \| `ignore` | yes |  |  |

#### `get_inbox`

**Read your LinkedIn inbox.** Recent conversations: who, the last message, when, whether unread, and the thread URL.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `10` | 1–20. |

#### `get_conversation`

**Read a conversation.** Messages in one conversation, oldest first. Pass a thread URL from get_inbox, or a connection's profile URL or username. Opening a thread marks it as read on LinkedIn, and the other person may see a read receipt.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `thread_or_profile` | string | yes |  |  |
| `limit` | integer | no | `20` | 1–50. |

#### `send_message`

**Send a message.** Prepare a LinkedIn message to an existing conversation (thread URL) or a connection (profile URL or username). Counts against the daily message limit.

*Sends after your approval (returns a preview first).*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `profile_or_thread` | string | yes |  |  |
| `text` | string | yes |  | up to 8000 characters. |

</details>

<details>
<summary><b>Growth strategy, planning and playbook</b> (7 tools, toolset <code>growth</code>)</summary>

#### `growth_profile`

**Growth profile (brand book).** Get or update the user's brand book for LinkedIn growth: identity and role, offer, ideal audience (who, pains, desires, objections), goals with targets and dates, a proof bank of stories, wins, numbers and case studies (each with a date and a source), voice (writing samples, tone words, phrases, banned words), topics to avoid, posting constraints (hours per week, days, time windows) and brand visuals (colours, fonts, logo and headshot paths for images and carousels). update deep-merges `patch` (lists in a patch replace the stored list), adds list items with `append`, and removes fields with `unset` (dotted paths). Every result includes completeness: what's missing for a good strategy, with next_questions to ask the user. Ask, don't invent: only store what the user said. Local only: this tool never sends anything to LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `action` | `get` \| `update` | no | `get` |  |
| `patch` | object | no |  | Fields to set. Objects merge; lists replace. Unknown fields are rejected. fields: `identity`, `offer`, `audience`, `goals`, `proof_bank`, `voice`, `topics_to_avoid`, `posting_constraints`, `visuals`. |
| `append` | object | no |  | List items to add, e.g. { proof_bank: [...] } or { voice: { banned_words: ['synergy'] } }. fields: `identity`, `offer`, `audience`, `goals`, `proof_bank`, `voice`, `topics_to_avoid`, `posting_constraints`, `visuals`. |
| `unset` | string[] | no |  | Dotted paths of profile fields to remove, e.g. ['offer.price_point']. 0–50 items. |

#### `growth_strategy`

**Growth strategy.** Get, save a draft of, approve, or archive the user's LinkedIn strategy: positioning, 3-5 content pillars (each with a funnel stage TOF/MOF/BOF, share %, example angles and the proof it draws on), funnel mix with reasons, cadence (posts per week, days, time windows), format mix, engagement plan, CTA ladder, KPIs with targets and a review date. save_draft merges `strategy` into the latest draft (or the approved one) and saves a new version; cadence gaps are filled from the profile and the analytics history. approve needs approve: true and is only for after the user explicitly approved that version; an existing approved strategy is replaced only with replace_approved: true. Every version is kept. strategy.md in the growth folder is a readable export for the user. Local only: this tool never sends anything to LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `action` | `get` \| `save_draft` \| `approve` \| `archive` | no | `get` |  |
| `strategy` | object | no |  | For save_draft: the fields to set. Objects merge, lists replace. fields: `positioning`, `pillars`, `funnel_mix`, `cadence`, `format_mix`, `engagement_plan`, `cta_ladder`, `kpis`, `review_date`, `notes`. |
| `base` | `latest` \| `approved` \| `empty` | no | `latest` | save_draft starts from the latest draft (else the approved strategy), the approved strategy, or nothing. |
| `change_note` | string | no |  | What changed and why, kept in the version history. up to 300 characters. |
| `version` | integer | no |  | approve: the draft version (default the latest draft). archive: required. 1–9007199254740991. |
| `approve` | boolean | no |  | Must be true to approve. Set it only after the user said yes to this version. |
| `replace_approved` | boolean | no | `false` | Allow replacing or archiving the currently approved strategy. Only when the user asked for it. |

#### `growth_ideas`

**Content ideas.** Add, list, update and archive content ideas. Each idea has a thesis, pillar, funnel stage, method (story, listicle, contrarian, how-to…), format, 2-4 hook options, the evidence it needs and whether that's available, a source (own_story, audience_question, comment, trend, past_winner, or repurpose of a post_url), a status (new, drafted, scheduled, published, dropped) and 1-5 scores (audience_fit, proof_strength, novelty, effort) that make score_total (0-100). list filters by any of these and sorts by score by default. Archived ideas are hidden unless include_archived. Local only: this tool never sends anything to LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `action` | `add` \| `list` \| `update` \| `archive` | no | `list` |  |
| `ideas` | object[] | no |  | add: 1-20 ideas. 1–20 items. each with: `thesis`, `pillar`, `funnel_stage`, `method`, `format`, `hooks`, `evidence`, `source`, `scores`, `notes`. |
| `idea_id` | string | no |  | update: the idea to change. |
| `patch` | object | no |  | update: fields to change, including status. fields: `thesis`, `pillar`, `funnel_stage`, `method`, `format`, `hooks`, `evidence`, `source`, `scores`, `notes`, `status`. |
| `ids` | string[] | no |  | archive: ideas to archive. 1–50 items. |
| `filters` | object | no |  | fields: `status`, `pillar`, `funnel_stage`, `method`, `format`, `source_type`, `evidence_available`, `query`, `include_archived`. |
| `sort` | `score` \| `newest` \| `oldest` | no | `score` |  |
| `limit` | integer | no | `50` | 1–200. |

#### `growth_calendar`

**Content calendar.** Plan posts in a local calendar. generate creates slots for a date range from the strategy cadence (respecting the user's posting days and time windows; one post a day at most), assigning pillars and formats by their shares, and suggests better time windows when the analytics history supports them. add creates one slot; update assigns an idea, attaches draft text (checked with review_post automatically) and media paths, sets the status (planned, drafted, ready, scheduled, published, skipped) and stores the scheduling result (scheduled_for or post_url). upcoming shows the next 14 days; list shows any range. This tool never schedules or posts: for a ready slot, call schedule_post with its schedule_post_input, show the preview, and confirm only after the user approves. Local only: this tool never sends anything to LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `action` | `upcoming` \| `list` \| `generate` \| `add` \| `update` | no | `upcoming` |  |
| `from` | string | no |  | generate/list: first day (default today). pattern `^\d{4}-\d{2}-\d{2}$`. |
| `to` | string | no |  | generate: last day (default from + 13 days). list: default from + 30 days. pattern `^\d{4}-\d{2}-\d{2}$`. |
| `days` | integer | no | `14` | upcoming: how many days ahead. 1–90. |
| `statuses` | array of `planned` \| `drafted` \| `ready` \| `scheduled` \| `published` \| `skipped` | no |  | list: only these statuses. 0–6 items. |
| `use_analytics_windows` | boolean | no | `false` | generate: use the best time windows from the analytics history when the sample supports them. |
| `slot_id` | string | no |  | update: the slot to change. |
| `date` | string | no |  | pattern `^\d{4}-\d{2}-\d{2}$`. |
| `time` | string | no |  | pattern `^([01]\d\|2[0-3]):[0-5]\d$`. |
| `idea_id` | string | no |  | up to 20 characters. |
| `pillar` | string | no |  | up to 80 characters. |
| `funnel_stage` | `TOF` \| `MOF` \| `BOF` | no |  | TOF = reach and awareness, MOF = trust and consideration, BOF = conversion. |
| `method` | string | no |  | up to 80 characters. |
| `format` | `text` \| `image` \| `carousel` \| `video` \| `poll` \| `article` \| `newsletter` | no |  |  |
| `draft_text` | string | no |  | The post text. It is checked with review_post when attached. up to 3000 characters. |
| `media_paths` | string[] | no |  | Absolute paths: up to 9 images, or one PDF/PPTX/DOCX for a carousel. 0–9 items. |
| `document_title` | string | no |  | Title for a document (carousel) post. up to 100 characters. |
| `status` | `planned` \| `drafted` \| `ready` \| `scheduled` \| `published` \| `skipped` | no |  |  |
| `scheduled_for` | string | no |  | When LinkedIn's scheduler will publish it (ISO 8601), from schedule_post's result. |
| `post_url` | string | no |  | The post URL once it is live. |
| `published_at` | string | no |  | ISO 8601. |
| `notes` | string | no |  | up to 1000 characters. |
| `clear` | array of `idea_id` \| `pillar` \| `funnel_stage` \| `method` \| `format` \| `draft_text` \| `media_paths` \| `document_title` \| `scheduled_for` \| `post_url` \| `published_at` \| `notes` \| `review` | no |  | update: fields to remove from the slot. 0–13 items. |

#### `review_post`

**Review a post draft.** Check a LinkedIn post draft with deterministic, explainable rules (no AI call). Returns a 0-100 score, pass/warn/fail checks each with a reason and a concrete fix, and the hook as it appears before LinkedIn's '…see more' fold on desktop and mobile. Checks: character limit, hook length and fold, first-line strength, readability (Flesch), sentence and paragraph length, whitespace, total length, specificity, 'you' vs 'I', machine-writing tells, hashtags, external links, engagement bait LinkedIn demotes, CTA presence and fit with the funnel stage, the user's banned words and topics, and repeated openings vs recent posts. Thresholds are approximate; explain: true adds the basis for each. Local only: this tool never sends anything to LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `text` | string | yes |  | The draft. Longer than 3,000 characters is allowed so the limit check can report it. up to 10000 characters. |
| `funnel_stage` | `TOF` \| `MOF` \| `BOF` | no |  |  |
| `method` | string | no |  | e.g. story, listicle, how-to; story posts get a looser 'I' ratio. up to 80 characters. |
| `has_media` | boolean | no |  | An image, carousel or video is attached (LinkedIn shows fewer lines above the fold). |
| `slot_id` | string | no |  | A calendar slot this draft belongs to: its funnel stage, method and media fill gaps, and it is left out of the repeated-opening comparison. |
| `use_profile` | boolean | no | `true` | Check the growth profile's banned words, phrases and topics. |
| `compare_history` | boolean | no | `true` | Compare the opening with recent posts and other calendar drafts. |
| `fold` | object | no |  | Override the fold estimate if LinkedIn shows more or less than expected. fields: `desktop_chars`, `desktop_lines_text_only`, `desktop_lines_with_media`, `desktop_chars_per_line`, `mobile_chars`, `mobile_lines`, `mobile_chars_per_line`. |
| `explain` | boolean | no | `false` | Include the basis and source of every threshold. |

#### `growth_report`

**Growth report.** The feedback loop: reads the user's recent posts (and optionally the analytics page of the last few, and the profile dashboard) through the browser, appends dated snapshots to the local analytics history (one per post per day), links published posts to calendar slots, and reports engagement rate and comment rate per post, best and worst pillars, methods, formats and hook types, best weekdays and time windows, follower and profile-view trends, progress on strategy KPIs, and recommendations with confidence levels. Small samples are labelled 'directional only'. offline: true uses only the stored history (no browser). Online it is read-only and counts against the usual page-load cap: about 1 page for posts, 1 for the dashboard and 1 per post analytics page.

*Reads LinkedIn.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `offline` | boolean | no | `false` | Use only the stored history; don't open LinkedIn. |
| `posts` | integer | no | `10` | How many recent posts to read. 1–20. |
| `post_analytics` | integer | no | `3` | Also open the analytics page of this many recent posts (one page load each). 0–5. |
| `profile_analytics` | boolean | no | `true` | Also read the dashboard (followers, profile viewers, impressions). |
| `window_days` | integer | no | `90` | Analyse posts from this many days back. 7–365. |

#### `get_playbook`

**Read the LinkedIn growth playbook.** A researched, sourced LinkedIn growth playbook: how the feed distributes posts (official statements vs data studies vs practitioner advice), the psychology of attention and persuasion, hooks, 28 post formats, content strategy and funnels, profile optimisation, engagement, writing and voice, measurement and experiments, persona playbooks (founders, sales, job seekers, consultants, creators) and ethics. With no arguments it returns the index. With topic it returns that topic in full as markdown. With query it returns the most relevant sections (within topic, if both are given). Read the relevant topic before planning strategy, writing or reviewing posts. Reads local text only; never contacts LinkedIn.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `topic` | string | no |  | Topic id: algorithm, psychology, hooks, post-formats, content-strategy, profile, engagement, writing, measurement, personas, ethics. up to 100 characters. |
| `query` | string | no |  | Free-text search, e.g. "link in first comment", "carousel slides", "headline formula". up to 300 characters. |

</details>

<details>
<summary><b>Images, quote cards and carousels</b> (5 tools, toolset <code>visuals</code>)</summary>

#### `generate_image`

**Generate an image with AI.** Create photos or illustrations for a post with an AI image model (Higgsfield, OpenAI, Gemini, fal.ai, Replicate or Ideogram). It uses the user's own API key for that provider and may cost money on their account, so generate only what the user asked for and say which provider was used. Files are saved to linkedin-mcp's media folder and checked to be real PNG/JPEG images. Nothing is sent to LinkedIn. Ideogram is best for legible text in images; for quotes and slides use create_quote_card or create_carousel instead (free, no AI). Avoid depicting real people or brands without permission. Call image_providers to see which providers are set up. If it returns status pending, call again with only job_id.

*Calls an outside service.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `prompt` | string | no |  | What to draw: subject, setting, composition, lighting, mood. Required unless job_id is given. up to 4000 characters. |
| `aspect_ratio` | `1:1` \| `4:5` \| `16:9` \| `1.91:1` | no | `1:1` | 1:1 square, 4:5 portrait (most feed space), 16:9 landscape, 1.91:1 link-preview landscape. Providers without a ratio use the closest one and say so. |
| `count` | integer | no | `1` | How many images (1-4). Each one costs money. 1–4. |
| `style` | string | no |  | Style direction, e.g. 'editorial photo, soft daylight' or 'flat vector illustration'. up to 300 characters. |
| `negative_prompt` | string | no |  | Things to avoid. up to 500 characters. |
| `seed` | integer | no |  | For repeatable results, where the provider supports it. 0–2147483647. |
| `provider` | `higgsfield` \| `openai` \| `gemini` \| `fal` \| `replicate` \| `ideogram` | no |  | Use this provider instead of the configured one. |
| `model` | string | no |  | Use this model id instead of the provider's default. up to 100 characters. |
| `job_id` | string | no |  | From an earlier pending result: wait for that generation instead of starting a new one. pattern `^img_[0-9a-f]{12}$`. |

#### `create_quote_card`

**Create a quote card image.** Render a branded quote card as a PNG (1080x1350 portrait by default, or 1080x1080 square) with the quote, author name, a second line such as a title or handle, and an optional headshot and logo. Made locally in a separate headless browser: no AI, no account, no cost. Text shrinks to fit; warnings say when it's too long. Nothing is sent to LinkedIn. To post, pass the paths in create_post or schedule_post as images (up to 9 per post). Show the image to the user first if your client can; nothing is posted until they approve the post preview.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `quote` | string | yes |  | The quote. Up to about 250 characters reads best. up to 500 characters. |
| `author` | object | no |  | fields: `name`, `handle`, `headshot_path`. |
| `size` | `portrait` \| `square` | no | `portrait` | portrait is 1080x1350 (most feed space), square is 1080x1080. |
| `theme` | `midnight` \| `paper` \| `cobalt` \| `mono` | no |  | Look: midnight (near-black with warm amber highlights and a geometric sans); paper (warm cream pages, an editorial serif and burnt-orange accents, with dark title slides); cobalt (bold cobalt-blue title slides with a yellow highlight; clean white content slides); mono (black and off-white only, generous space, tight type). Defaults to the brand theme, else midnight. |
| `brand` | object | no |  | Overrides for this image only. Defaults come from brand settings in config.json. fields: `primary_color`, `accent_color`, `font`, `logo_path`. |

#### `create_carousel`

**Create a carousel (PDF).** Render a swipeable LinkedIn carousel as a PDF: a title slide, 3 to 15 content slides (heading plus body text, bullets or a big number) and an end slide with a call to action, at 1080x1350 per page. Also saves PNG previews of the first slides so you can show the user. Made locally in a separate headless browser: no AI, no account, no cost. Text shrinks to fit each slide; warnings name any slide whose text is too long. Nothing is sent to LinkedIn. To post it, pass document: {path, title} from the result to create_post or schedule_post, after showing the previews.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `title` | string | yes |  | Title slide headline. Short and specific works best (under about 60 characters). up to 140 characters. |
| `subtitle` | string | no |  | One line under the title. up to 240 characters. |
| `kicker` | string | no |  | Small label above the title, e.g. 'Founder notes'. up to 40 characters. |
| `slides` | object[] | yes |  | The content slides, in order. 3–15 items. each with: `heading`, `body`, `bullets`, `big_number`. |
| `cta` | object | no |  | fields: `heading`, `body`, `button`. |
| `author` | object | no |  | fields: `name`, `handle`, `headshot_path`. |
| `theme` | `midnight` \| `paper` \| `cobalt` \| `mono` | no |  | Look: midnight (near-black with warm amber highlights and a geometric sans); paper (warm cream pages, an editorial serif and burnt-orange accents, with dark title slides); cobalt (bold cobalt-blue title slides with a yellow highlight; clean white content slides); mono (black and off-white only, generous space, tight type). Defaults to the brand theme, else midnight. |
| `brand` | object | no |  | Overrides for this image only. Defaults come from brand settings in config.json. fields: `primary_color`, `accent_color`, `font`, `logo_path`. |
| `document_title` | string | no |  | Title LinkedIn shows on the document. Defaults to the title. up to 100 characters. |
| `preview_count` | integer | no | `3` | How many PNG previews of the first slides to save. 1–5. |

#### `list_media`

**List generated images and carousels.** Recent files in linkedin-mcp's media folder (generated images, quote cards, carousel PDFs and previews), newest first, with absolute paths ready for create_post's images or document. complete is false when there are more files than the limit.

*Runs on your computer.*

| Parameter | Type | Required | Default | Details |
|---|---|---|---|---|
| `limit` | integer | no | `20` | 1–50. |
| `kind` | `image` \| `document` | no |  | Only images (PNG/JPEG/GIF) or only documents (PDF). |

#### `image_providers`

**Show AI image providers.** Which AI image providers are set up for generate_image, which one is used, their default models, and how to set each one up. Keys are read from the MCP server's environment; this never shows them. create_quote_card and create_carousel need no provider.

*Runs on your computer.*

No parameters.

</details>

**Toolsets.** Load fewer tools with `LINKEDIN_MCP_TOOLSETS` (comma-separated presets and groups; `core` is always on):

| Preset | Groups | Tools |
|---|---|---|
| `all` | `core`, `posting`, `engagement`, `research`, `jobs`, `network`, `growth`, `visuals` | 53 |
| `creator` | `core`, `posting`, `engagement`, `growth`, `visuals` | 38 |
| `outreach` | `core`, `research`, `jobs`, `network` | 27 |
| `lite` | `core`, `posting`, `engagement` | 26 |

<!-- generated:tools:end -->

## Prompts and resources

Clients that support MCP **prompts** show these as ready-made workflows (often as slash commands):

<!-- generated:prompts:start (npm run docs) -->
| Prompt | What it does | Arguments (all optional) |
|---|---|---|
| `start_growth_strategy` | Interview the user in small batches about goals, audience, offer, proof and voice, then draft a LinkedIn strategy for their approval. | `goal`: Main goal, e.g. audience growth, leads, hiring, job search or thought leadership.<br>`persona`: Who the user is, e.g. founder, B2B seller, job seeker, consultant or creator. |
| `plan_my_week` | Turn the approved strategy and idea bank into a week of posts and engagement, save it to the content calendar, and schedule the approved week in one sitting. | `week_start`: The Monday of the week to plan, e.g. 2026-12-07. Defaults to next week.<br>`posts_per_week`: How many posts this week. Defaults to the strategy's cadence. |
| `write_post` | Write a post step by step: sharpen the idea, choose a method, offer hook options, draft in the user's voice, then self-review with review_post before anything is published. | `idea`: The idea, story or topic for the post (optional; otherwise pick from the idea bank or calendar).<br>`format`: A preferred method from the playbook, e.g. case study, contrarian take, carousel.<br>`pillar`: The content pillar this post belongs to. |
| `engagement_session` | A short, genuine engagement session: reply on your own posts first, then a few high-value comments on posts your audience reads, each approved one at a time within the caps. | `minutes`: Time available, e.g. 20. Defaults to 20 minutes.<br>`focus`: Optional focus: a pillar, a topic or specific people. |
| `profile_audit` | Read the user's profile with get_my_profile, score it against the playbook's 12-point checklist, and propose specific rewrites the user can apply. | `goal`: What the profile should achieve, e.g. leads, a job, followers.<br>`target_role`: For job seekers: the role they're targeting. |
| `monthly_growth_review` | Review last month's posts and profile analytics against the strategy and the user's own baseline, record a snapshot with growth_report, and propose one experiment and one change. | `month`: The month to review, e.g. 2026-11. Defaults to the last full month. |
| `repurpose_post` | Turn one strong post into several new assets (carousel, quote card, follow-up, opposite angle, newsletter section), each with a new hook, saved to the idea bank and published only with approval. | `post_url`: URL of the user's own post to repurpose (optional; otherwise suggest strong candidates).<br>`formats`: Formats wanted, e.g. carousel, quote card, follow-up post. |
| `reply_to_comments` | Find comments on the user's recent posts, triage them, draft substantive replies in their voice, and send each reply only after it is approved. | `post_url`: URL of the post whose comments to answer (optional; otherwise the most recent posts). |

<!-- generated:prompts:end -->

Clients that support MCP **resources** can attach the growth playbook directly. Every client can read the same material with the `get_playbook` tool.

<!-- generated:resources:start (npm run docs) -->
| Resource | Topic | What it covers |
|---|---|---|
| `linkedin-mcp://playbook/index` | Index | Every topic with a summary. |
| `linkedin-mcp://playbook/algorithm` | How LinkedIn distributes posts | What LinkedIn has officially said about feed ranking, what large data studies found, and what practitioners believe, each labelled by evidence level: dwell time, comments, saves and sends, links, hashtags, frequency, editing, tagging, formats and the first hours. |
| `linkedin-mcp://playbook/psychology` | Psychology of attention and persuasion | The research behind attention, memory, sharing and persuasion (Cialdini, Berger's STEPPS, the Heaths' SUCCESs, curiosity gaps, fluency, exposure, self-reference, narrative, concreteness, IKEA effect, loss aversion, identity), each with its source, how to apply it to LinkedIn posts, and where the ethical line is. |
| `linkedin-mcp://playbook/hooks` | Hooks and the first lines | How the opening lines decide whether a post is read: the 'see more' fold, sixteen hook types with the psychology behind each, 48 original example hooks across niches, a method for writing hook options, and what to avoid (clickbait, false suspense, fake numbers). |
| `linkedin-mcp://playbook/post-formats` | Post methods and formats library | 28 proven post methods (story with lesson, contrarian take, framework, case study, teardown, prediction, tech stack, carousel, poll, newsletter teaser, milestone, strategic tag and more). Each has how it works, why it works, the best funnel stage, the evidence it needs, its risks, and an original example outline. |
| `linkedin-mcp://playbook/content-strategy` | Content strategy | Positioning and an ICP worksheet, content pillars, the TOF/MOF/BOF funnel with starting ratios by goal and the reasons, CTA ladders, lead magnets, cadence by growth stage, a repurposing system, batching workflows and a weekly operating rhythm. |
| `linkedin-mcp://playbook/profile` | Profile optimisation | How to turn a LinkedIn profile into a landing page: headline formulas, the About structure, Featured, cover image, photo, CTA, skills, custom URL, Open to Work and Service Pages, with LinkedIn's own specifications and a scored audit checklist. |
| `linkedin-mcp://playbook/engagement` | Engagement playbook | How to grow through conversation: value-adding comment formulas, target-account lists, a sustainable daily engagement budget, replying to comments on your posts, DM etiquette without pitch-slapping, and relationship building. Engagement pods and automated engagement violate LinkedIn's policies. |
| `linkedin-mcp://playbook/writing` | Writing quality and voice | How to write posts people finish: readability, line breaks, length bands from data, specificity, a list of AI-writing tells to avoid, capturing someone's voice from samples, an eight-pass editing process and a 20-point self-review rubric. |
| `linkedin-mcp://playbook/measurement` | Measurement and experiments | LinkedIn's own metric definitions (impressions, members reached, saves, sends, profile views, followers gained), derived rates, which metrics fit which goal, benchmark ranges with sources and years, how to read small samples, and how to run one-variable experiments. |
| `linkedin-mcp://playbook/personas` | Playbooks by persona | Specific playbooks for founders and CEOs, B2B sellers, job seekers, consultants and agency owners, and creators: goals, positioning, pillars, funnel mix, formats, cadence, profile priorities, engagement focus, metrics, pitfalls and a first-30-days plan. |
| `linkedin-mcp://playbook/ethics` | Ethics and compliance | What not to do, aligned with LinkedIn's Professional Community Policies and User Agreement: pods, automation, engagement bait, fake or misleading claims, undisclosed sponsorships, giveaways, copying, scraping, spam, harassment, privacy and confidentiality, honest use of AI, and how linkedin-mcp's safety model fits. |

<!-- generated:resources:end -->

## Safety

LinkedIn's terms don't allow automation (see the [disclaimer](#disclaimer)), and accounts that behave like bots get restricted. linkedin-mcp is designed so that the defaults keep your activity looking like what it is: one person, using their own account, at a human pace.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/safety-dark.png">
  <img alt="Daily caps halved during a 14-day warm-up, working hours from 08:00 to 21:00, and the guard that pauses everything for 24 hours when LinkedIn shows a security check." src="docs/assets/safety-light.png" width="100%">
</picture>

### You approve everything that's sent

- Every tool that sends something returns a preview of exactly what will be sent and where, plus a single-use `confirmation_token` that expires after 10 minutes.
- The token is bound to the exact text, target and files in the preview. Attached files are fingerprinted, and a file that changes before you confirm is refused.
- **Approval in your AI client.** When your client supports MCP dialogs (elicitation), `confirm_action` also asks you directly, showing every field of the preview. The model can't answer that dialog, so a feed post or message written to manipulate your assistant can't get anything sent. Declining sends nothing.
- Feed posts, comments and messages are passed to your assistant as data from other people. Read previews before approving, especially messages and connection notes.

### Sends are checked, not assumed

After the final click, linkedin-mcp reads LinkedIn back: the message appears in the thread, the invitation shows as pending, the comment is under the post. The result is one of:

| Result | Meaning | Retry? |
|---|---|---|
| `sent` | Confirmed on LinkedIn. | No need. |
| `unconfirmed` | The send button was clicked but LinkedIn didn't show the result. | **No.** Check LinkedIn first, or you may send it twice. |
| `not_sent` | Stopped before sending, with the reason (for example LinkedIn asked for the person's email). | Yes, once the reason is dealt with. |

Before sending a message, linkedin-mcp checks that the conversation window names the person you asked for.

### Daily and weekly caps

| Action | Default per day | Hard ceiling per day | Ceiling per 7 days |
|---|---|---|---|
| Posts (published or scheduled) | 2 | 3 | 15 |
| Comments and replies | 15 | 30 | 150 |
| Reactions | 40 | 100 | 500 |
| Connection requests | 10 | 20 | 80 |
| Messages | 15 | 30 | 150 |
| Profile views (research) | 40 | 80 | 400 |
| Searches | 15 | 30 | 150 |
| Page loads overall | 300 | 500 | - |

- Lower any cap with `set_limits`. You can raise caps up to the hard ceiling, never above it.
- **Warm-up:** for the first 14 days after your first sign-in, every daily cap is halved.
- When a cap is hit, the tool says when it resets. Nothing is queued or retried behind your back. Attempts count even if LinkedIn then fails, so errors can't be used to go over a cap.

### Working hours and pacing

- Sends only run between 08:00 and 21:00 your local time by default. Reads work at any time.
- One browser, one tab, one action at a time, with a randomised human-like gap between actions (around 4 seconds typical), a pause after each page load and natural typing for short text.
- Each tool call has a time budget (55 seconds by default) so it answers before typical client timeouts.
- The browser uses your system's locale and timezone. Nothing is randomised or spoofed.

### Automatic pause

After every page load, linkedin-mcp checks for CAPTCHAs, verification prompts, "unusual activity" notices, restriction pages and sign-in walls, and watches for LinkedIn's rate-limit responses. If it sees one, it stops all tools (24 hours for a security check, a few hours for rate limiting), records it in the audit log, and tells you what to do. It never tries to solve a challenge.

### Audit log

Every confirmed action is appended to `~/.config/linkedin-mcp/state/audit.jsonl` with the time, tool, target, a hash of the text and the result. The text itself isn't stored. Ask your assistant for `get_audit_log`.

### What it won't do

Deliberately out of scope: multiple accounts, proxies, CAPTCHA solving, fingerprint spoofing, bulk scraping or exporting people's data, applying to jobs, and mass messaging or connection campaigns. linkedin-mcp is for running your own account, not for growth hacking.

## Error codes

Every error has a stable `code`, a plain `message` and a `next_step` your assistant relays.

| Code | Meaning |
|---|---|
| `NOT_LOGGED_IN` | No LinkedIn session (or the API connection expired). Run `login` (or `connect-api`). |
| `LIMIT_REACHED` | A daily or weekly cap is used up; the error says when it resets. Never queued or bypassed. |
| `OUTSIDE_WORKING_HOURS` | A send was asked for outside your working hours. Reads work any time. |
| `CIRCUIT_OPEN` | Automation is paused (by you, a security check or rate limiting). |
| `CHECKPOINT` | LinkedIn showed a CAPTCHA, verification or restriction. Everything pauses for 24 hours. |
| `RATE_LIMITED` | LinkedIn answered "too many requests" (HTTP 429/999) or looped redirects. Paused for the time LinkedIn asked, or about 4 hours. |
| `SELECTOR_BROKEN` | LinkedIn changed a page's layout. Run `doctor` and report it. |
| `CONFIRMATION_INVALID` | The token was used, expired (10 minutes) or doesn't match the preview. |
| `USER_DECLINED` | You declined in the approval dialog. Nothing was sent. |
| `UNSUPPORTED_LANGUAGE` | LinkedIn isn't set to English, so sending stopped before typing anything. |
| `INVALID_INPUT` | Something in the request is wrong; the message says what. |
| `NOT_FOUND` | The profile, post, company or job doesn't exist or isn't visible to you. |
| `TIMEOUT` | LinkedIn was slow or the call ran out of its time budget. |
| `NETWORK` | The connection failed or a different site answered (for example a Wi-Fi sign-in page). |
| `BROWSER_UNAVAILABLE` | Chrome couldn't start, the profile is in use, or the browser is older than the profile. |
| `INTERNAL` | Something unexpected; please open an issue. |

Send results are separate from errors: `sent`, `unconfirmed` (don't retry) or `not_sent` (safe to retry). Full guide: [docs/troubleshooting.md](docs/troubleshooting.md).

## Data and privacy

Everything stays on your computer, in one folder (`~/.config/linkedin-mcp`, or `%LOCALAPPDATA%\linkedin-mcp` on Windows), readable only by you:

| Path | Contents |
|---|---|
| `profile/` | The Chrome profile with your LinkedIn session cookies. Treat it like a password. |
| `config.json` | Your settings (and your developer app's ID and secret, if you saved them). |
| `state/` | Usage counters, pause state, audit log (a hash of each text, not the text), cached account name, API token, browser version. |
| `growth/` | Brand book, strategy (`strategy.md` too), ideas, calendar and analytics history. |
| `media/` | Images and carousels linkedin-mcp created. The only part of this folder that uploads may come from. |

Nothing is sent anywhere except the browser's normal traffic to LinkedIn, LinkedIn's API if you connect it, and image prompts to the image provider you choose. There's no telemetry, no account and no hosted component. `logout` deletes the browser profile; `disconnect-api` deletes the API token.

## How it compares

The best-known open-source alternative is [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server), a good Python server built mainly for research, jobs and outreach. linkedin-mcp is built for running your own presence. This compares the two projects' tool lists and docs as of November 2026.

| | **linkedin-mcp** (this project) | stickerdaniel/linkedin-mcp-server |
|---|---|---|
| Install | `npx` (Node 20+), pinned and shrinkwrapped | `uvx` (Python), `.mcpb` bundle, Docker or plugins |
| Create and schedule posts (images, PDF carousels) | Yes | No |
| Post through LinkedIn's official API with your own app | Yes (optional) | No |
| Post and profile analytics | Yes | No |
| Comment, reply and react | Yes | No |
| Notifications and invitation management | Yes | No |
| Strategy, idea bank, content calendar, analytics feedback loop | Yes | No |
| Draft checker and sourced growth playbook | Yes | No |
| Branded carousels and quote cards, AI images | Yes | No |
| Approve a planned week in one sitting | Yes | No |
| Feed, post search, profiles, companies, people search | Yes | Yes |
| A person's and a company's posts | Yes | Yes |
| Job search, job details, saved jobs | Yes | Yes, plus apply links and Easy Apply forms |
| Messages and connection requests | Yes | Yes, plus conversation search and archive |
| Company employees, "people also viewed" | No | Yes |
| Confirmation before sending | Preview, token, and a dialog in supporting clients | Dialog in supporting clients |
| Daily and weekly caps, warm-up, working hours | Yes | No (pacing is left to the client) |
| Read-only mode, dry-run mode | Yes | No |
| Pause on security checks and rate limits | Yes | Rate limits reported |

Paid tools do more in some areas (team features, hosted scheduling, CRM integrations) and cost a monthly subscription:

| Tool | What it's for | Price |
|---|---|---|
| [Taplio](https://taplio.com) | LinkedIn content, scheduling and analytics | From about $39/month |
| [Phantombuster](https://phantombuster.com) | Automation and data extraction across platforms | From about $69/month, limited free tier |
| [Expandi](https://expandi.io) | LinkedIn outreach campaigns | From about $99/month per account |

Prices are from each vendor's site in November 2026 and may have changed. linkedin-mcp is free and runs on your own computer.

## Configuration

Settings come from environment variables (put them under `env` in your AI client's MCP config) or from `~/.config/linkedin-mcp/config.json` (`%LOCALAPPDATA%\linkedin-mcp\config.json` on Windows). Environment variables win. Every setting is optional.

**Safety and behaviour**

| Environment variable | Default | What it does |
|---|---|---|
| `LINKEDIN_MCP_DRY_RUN` | `false` | Simulate sends instead of sending. |
| `LINKEDIN_MCP_READ_ONLY` | `false` | Hide and refuse every tool that can send something. |
| `LINKEDIN_MCP_CONFIRM_IN_CLIENT` | `true` | Ask for approval in a client dialog (MCP elicitation) when the client supports it. |
| `LINKEDIN_MCP_CONFIRM_REACTIONS` | `true` | `false` lets reactions run without a confirmation step. |
| `LINKEDIN_MCP_WORKING_HOURS` | `08:00-21:00` | When sends may run, local time. `off` disables it. Overnight ranges like `22:00-06:00` work. |
| `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS` | `55` | Time budget for one tool call (20 to 600), kept under common 60-second client timeouts. |
| `LINKEDIN_MCP_TOOLSETS` | `all` | Load only some tool groups: presets `all`, `creator`, `outreach`, `lite`, or groups `core`, `posting`, `engagement`, `research`, `jobs`, `network`, `growth`, `visuals`, comma-separated. For clients with tool limits or small context windows. |

**Browser**

| Environment variable | Default | What it does |
|---|---|---|
| `LINKEDIN_MCP_HEADLESS` | `true` | `false` shows the browser window while the assistant works. |
| `LINKEDIN_MCP_IDLE_TIMEOUT_MINUTES` | `10` | Close the browser after this long without a tool call. |
| `LINKEDIN_MCP_BROWSER_CHANNEL` | `auto` | `auto` (Chrome if installed, else bundled Chromium), `chrome`, `chromium` or `msedge`. |
| `LINKEDIN_MCP_CHROME_PATH` | | Path to a specific Chrome executable. |
| `LINKEDIN_MCP_HOME` | `~/.config/linkedin-mcp` | Data folder: browser profile, settings, state, growth workspace and media. |

**Official API posting (optional)**

| Environment variable | Default | What it does |
|---|---|---|
| `LINKEDIN_MCP_POST_VIA` | `auto` | `auto`, `api` or `browser`: how `create_post` publishes. |
| `LINKEDIN_MCP_CLIENT_ID` / `LINKEDIN_MCP_CLIENT_SECRET` | | Your LinkedIn developer app. `connect-api` can save them to `config.json` for you. |
| `LINKEDIN_MCP_API_REDIRECT_PORT` | `8765` | Port in the app's redirect URL (`http://localhost:<port>/callback`). |
| `LINKEDIN_MCP_API_VERSION` | two months back | `LinkedIn-Version` header (YYYYMM), if LinkedIn rejects the default. |

**Images and brand**

| Environment variable | Default | What it does |
|---|---|---|
| `OPENAI_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `FAL_KEY`, `REPLICATE_API_TOKEN`, `IDEOGRAM_API_KEY`, `HF_API_KEY_ID` + `HF_API_KEY_SECRET` (Higgsfield) | | Your own key for AI image generation. Read from the environment only, never stored. |
| `LINKEDIN_MCP_IMAGE_PROVIDER` / `LINKEDIN_MCP_IMAGE_MODEL` | first configured | Which provider and model `generate_image` uses. |
| `LINKEDIN_MCP_IMAGE_TIMEOUT_SECONDS` | `300` | How long to wait for an image (30 to 900). |
| `LINKEDIN_MCP_BRAND_THEME` | `midnight` | Quote card and carousel theme: `midnight`, `paper`, `cobalt` or `mono`. |
| `LINKEDIN_MCP_BRAND_PRIMARY` / `LINKEDIN_MCP_BRAND_ACCENT` | theme colors | Brand colors, e.g. `#14213d`. |
| `LINKEDIN_MCP_BRAND_FONT` | theme font | `inter`, `manrope`, `space-grotesk`, `ibm-plex-sans`, `dm-sans`, `fraunces`, `playfair-display`, `source-serif-4`, `lora`, `system-sans` or `system-serif`. |
| `LINKEDIN_MCP_BRAND_LOGO` | | Logo image for carousels and cards. |
| `LINKEDIN_MCP_WEB_FONTS` | `true` | `false` uses system fonts only (no font download). |

**Local HTTP mode**

| Environment variable | Default | What it does |
|---|---|---|
| `LINKEDIN_MCP_PORT` | `3333` | Port for `--http` (always bound to 127.0.0.1). |
| `LINKEDIN_MCP_HTTP_TOKEN` | generated | Bearer token for `--http`. |

<details>
<summary><b>Example <code>config.json</code></b></summary>

```json
{
  "workingHours": { "start": "09:00", "end": "18:30" },
  "confirm": { "reactions": true, "inClient": true },
  "limits": { "comment": 10, "connection": 5 },
  "toolTimeoutSeconds": 90,
  "toolsets": ["creator"],
  "postVia": "auto",
  "images": { "provider": "higgsfield" },
  "brand": { "theme": "paper", "primaryColor": "#14213d", "accentColor": "#e85d04", "font": "manrope", "name": "Your Name", "handle": "@yourname" }
}
```

</details>

## Command line

```bash
npx @danishfareed/linkedin-mcp                  # start the MCP server over stdio (what clients run)
npx @danishfareed/linkedin-mcp login            # sign in, in a visible browser window
npx @danishfareed/linkedin-mcp status           # sign-in, pause, warm-up and limits summary
npx @danishfareed/linkedin-mcp doctor           # check the browser, sign-in and every page it reads (read-only)
npx @danishfareed/linkedin-mcp resume           # clear a pause after you've resolved a LinkedIn check
npx @danishfareed/linkedin-mcp install-browser  # download the Chromium build this version expects
npx @danishfareed/linkedin-mcp connect-api      # optional: post through LinkedIn's official API with your own app
npx @danishfareed/linkedin-mcp disconnect-api   # remove the API connection
npx @danishfareed/linkedin-mcp logout           # delete the saved browser profile
npx @danishfareed/linkedin-mcp --http           # local Streamable HTTP on 127.0.0.1:3333/mcp, token required
```

Other options: `--headed` (show the browser while serving), `--dry-run`, `--port <n>`, `status --verify`, `doctor --offline`, `login --keep-open`, `logout --yes`.

## FAQ

<details>
<summary><b>How do I connect LinkedIn to Claude?</b></summary>

Run `npx @danishfareed/linkedin-mcp login` once, then add linkedin-mcp to Claude: in **Claude Desktop**, Settings → Developer → Edit Config and paste the JSON from [Quick start](#quick-start); in **Claude Code**, run `claude mcp add linkedin --scope user -- npx -y @danishfareed/linkedin-mcp`. Restart Claude and ask "Check my LinkedIn session status."

</details>

<details>
<summary><b>How do I connect LinkedIn to ChatGPT?</b></summary>

Use the **ChatGPT desktop app** or **Codex**, which can run local MCP servers: add linkedin-mcp as a STDIO server with the command `npx -y @danishfareed/linkedin-mcp` (Settings → MCP servers, or `~/.codex/config.toml`). ChatGPT on the web can't reach a server on your computer. Step-by-step: [docs/clients.md](docs/clients.md).

</details>

<details>
<summary><b>Does it work with Cursor, VS Code Copilot, Gemini CLI, Windsurf and other AI tools?</b></summary>

Yes. It's a standard MCP server, so it works with any client that runs local MCP servers over stdio (or local HTTP), and its tool schemas are kept to the subset every major client accepts. See [Works with every AI assistant](#works-with-every-ai-assistant) and [docs/clients.md](docs/clients.md) for each client's setup.

</details>

<details>
<summary><b>My AI client limits how many tools it loads. What do I do?</b></summary>

Load fewer tools with `LINKEDIN_MCP_TOOLSETS`: `creator` (38 tools: posting, engagement, growth and visuals), `outreach` (27: research, jobs, network), `lite` (26: posting and engagement), or your own mix of groups such as `lite,growth`. Approval and safety tools are always included.

</details>

<details>
<summary><b>Can it create LinkedIn carousels and images?</b></summary>

Yes. `create_carousel` renders a branded PDF carousel and `create_quote_card` a quote image, both on your computer for free. `generate_image` creates photos and illustrations with Higgsfield, OpenAI, Gemini, fal.ai, Replicate or Ideogram using your own API key. Attach any of them to `create_post` or `schedule_post`.

</details>

<details>
<summary><b>Does it use the official LinkedIn API?</b></summary>

By default it uses your own signed-in browser, because LinkedIn's API doesn't offer personal analytics, comments, messages or invitations to ordinary apps. For publishing posts you can optionally connect your own LinkedIn developer app, and `create_post` then goes through LinkedIn's official Posts API. See [Official API posting](#official-api-posting-optional).

</details>

<details>
<summary><b>Can it write posts that sound like me?</b></summary>

That's what the brand book is for: give `growth_profile` a few of your past posts, the words you use and the ones you never use. Drafts are written from that voice, and `review_post` flags AI-sounding phrasing and your banned words before you see them.

</details>

<details>
<summary><b>Will my account get banned?</b></summary>

It can happen. LinkedIn's User Agreement prohibits automated access, and LinkedIn does restrict accounts it thinks are automated. linkedin-mcp is built to keep the risk down: a real browser you signed in to yourself, one thing at a time at a human pace, conservative daily and weekly caps, halved caps for the first two weeks, working hours, and a full stop the moment LinkedIn shows a warning or starts rate-limiting. It doesn't hide what it is or try to beat detection. There's no guarantee. Don't use it on an account you can't afford to lose.

</details>

<details>
<summary><b>Can it run my LinkedIn on autopilot?</b></summary>

Almost. Your assistant does the strategy, ideas, calendar, drafts, checks and visuals, and LinkedIn's scheduler publishes. The one thing it won't do is send without you: you approve each post, usually a whole week in one sitting with `confirm_batch`. Accounts that post without their owner are what LinkedIn restricts, and keeping you in the loop also means a post or message written to manipulate your assistant can't get anything sent.

</details>

<details>
<summary><b>Is it really free?</b></summary>

Yes. It's open source under Apache-2.0, runs entirely on your computer, and has no paid tier, account or telemetry. You need an AI client that supports MCP (many have free plans) and a LinkedIn account.

</details>

<details>
<summary><b>Can my assistant send something without me?</b></summary>

Not through linkedin-mcp. Every send needs a token from a preview, and `confirm_action` is the only way to use it. In clients that support MCP dialogs, you also approve in a dialog the model can't answer. For extra certainty, set `LINKEDIN_MCP_READ_ONLY=true` and the sending tools disappear entirely.

</details>

<details>
<summary><b>Does it store my password?</b></summary>

No. You sign in yourself in a normal Chrome window. linkedin-mcp keeps only the browser profile, which holds the session cookies, in `~/.config/linkedin-mcp/profile/` on your computer. Delete it any time with `logout`. Sign in with your email and password or a passkey: Google and Apple sign-in usually refuse to work inside an automated browser.

</details>

<details>
<summary><b>Do scheduled posts need my computer on?</b></summary>

No. `schedule_post` uses LinkedIn's built-in scheduler, so LinkedIn publishes the post at the scheduled time.

</details>

<details>
<summary><b>Does it work with Sales Navigator or Recruiter?</b></summary>

No. It works with regular LinkedIn (free or Premium). Sales Navigator, Recruiter, company page admin, ads, job applications, polls, events and video uploads aren't supported.

</details>

<details>
<summary><b>Can I run it on a server or in the cloud?</b></summary>

It's designed for your own computer, where you sign in and where LinkedIn already sees you. Running it from a data centre IP is far more likely to trigger LinkedIn's security checks. There's no hosted version.

</details>

<details>
<summary><b>Does it work if my LinkedIn is in another language?</b></summary>

Reading mostly works. Sending needs LinkedIn's display language set to English: linkedin-mcp checks the page language before it types anything and stops with `UNSUPPORTED_LANGUAGE` rather than failing halfway. Change it under Settings → Account preferences → Display language. Contributions for other languages are welcome.

</details>

<details>
<summary><b>Can I use it alongside stickerdaniel's LinkedIn MCP server?</b></summary>

Yes. linkedin-mcp keeps its data in `~/.config/linkedin-mcp`, separate from that server's `~/.linkedin-mcp`, so they don't share a browser profile or delete each other's files. Both are separate browser sessions on the same account, though, so LinkedIn sees the combined activity. Don't run them both heavily.

</details>

## Troubleshooting

Run `npx @danishfareed/linkedin-mcp doctor` first. Common fixes:

- **`NOT_LOGGED_IN`**: run `npx @danishfareed/linkedin-mcp login`.
- **`CHECKPOINT` or `CIRCUIT_OPEN`**: LinkedIn showed a security check and everything is paused. Run `login`, resolve it in the window, then ask your assistant to `resume`.
- **`RATE_LIMITED`**: LinkedIn is limiting requests. linkedin-mcp has paused itself; wait, and lower your caps if it happens again.
- **`SELECTOR_BROKEN`**: LinkedIn changed its layout. [Report it](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml) with the selector name from the error.
- **"No usable browser was found"**: install Chrome, or run `npx @danishfareed/linkedin-mcp install-browser`.

Full guide by error code: **[docs/troubleshooting.md](docs/troubleshooting.md)**.

## Contributing

The most valuable help is keeping up with LinkedIn's layout changes. Every selector lives in one file, [`src/linkedin/selectors.ts`](src/linkedin/selectors.ts), and parsers are tested against saved page snapshots, so most fixes are a few lines plus a test. See **[CONTRIBUTING.md](CONTRIBUTING.md)**. The images in this README are HTML in [`docs/assets/src`](docs/assets/src), rendered with `node scripts/assets/render.mjs`.

## Disclaimer

linkedin-mcp is an independent open-source project. It is not affiliated with, endorsed by or sponsored by LinkedIn Corporation or Microsoft. LinkedIn is a trademark of LinkedIn Corporation.

LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) prohibits using software to access the service in automated ways, and LinkedIn may restrict or close accounts that do. By using linkedin-mcp you accept that risk. Use it only with your own account, and follow LinkedIn's [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies). The software is provided as is, without warranty of any kind (see the licence).

## Licence

[Apache-2.0](LICENSE)
