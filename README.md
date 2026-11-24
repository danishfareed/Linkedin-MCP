# LinkedIn MCP Server: free, open-source LinkedIn automation for Claude, Cursor and any AI agent

[![npm](https://img.shields.io/npm/v/@danishfareed/linkedin-mcp)](https://www.npmjs.com/package/@danishfareed/linkedin-mcp)
[![CI](https://github.com/danishfareed/Linkedin-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/danishfareed/Linkedin-MCP/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**LinkedIn MCP** is a free, open-source [Model Context Protocol](https://modelcontextprotocol.io) server that lets your AI assistant run **your own** LinkedIn account. Ask Claude, Cursor, VS Code or any MCP client to draft and publish posts, **schedule LinkedIn posts** with LinkedIn's own scheduler, read your **LinkedIn analytics**, reply to comments, keep up with notifications and messages, and look up people and companies. It's LinkedIn automation built for creators, founders and job seekers, with safety rails on by default: nothing is sent until you approve a preview, daily caps keep activity at a human pace, and everything stops automatically if LinkedIn shows a security check.

It runs on your computer through a real Chrome browser that you sign in to yourself. No API keys, no paid service, no password stored.

```bash
npx @danishfareed/linkedin-mcp login
```

That opens a browser window. Sign in to LinkedIn, then add the server to your AI client ([setup below](#setup)).

> **Status: early release (0.1).** The safety layer is tested end to end. The parts that read and click LinkedIn's pages are new, and LinkedIn changes its layout often, so some tools will need fixes as more people use them. Run `npx @danishfareed/linkedin-mcp doctor` to check yours, and please [report anything broken](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml).

## Contents

- [What you can do](#what-you-can-do)
- [How it compares](#how-it-compares)
- [Setup](#setup)
- [Tools reference](#tools-reference)
- [Safety model](#safety-model)
- [Configuration](#configuration)
- [Command line](#command-line)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

## What you can do

Talk to your assistant normally. Some examples:

**Posting and scheduling**
- "Turn these meeting notes into a LinkedIn post and schedule it for Tuesday at 9am."
- "Post this carousel PDF with the title 'Five pricing mistakes' and a short intro."
- "What do I have scheduled this week?"

**Analytics**
- "How did my last five posts do? Which one got the most impressions per reaction?"
- "Show me the demographics of people who saw my post about hiring."
- "How many profile viewers and search appearances did I get this week?"

**Engagement**
- "Summarise the comments on my latest post and draft a reply to each question."
- "What's new in my notifications? Anything I should respond to?"
- "Find posts from the past week about MCP servers and suggest three I could add something useful to."

**Network and messages**
- "Who's sent me connection requests? Accept the ones who work in product."
- "Read my conversation with Chris and draft a reply suggesting Thursday."
- "Look up the founders of Northwind Labs and tell me what they've posted about recently."

Every action that sends something (post, comment, reaction, message, connection request) comes back to you as a preview first. The assistant shows it to you, and only sends it after you say yes.

## How it compares

The best-known open-source alternative is [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server), a good Python server built mainly for research and outreach. linkedin-mcp is built for running your own presence. The table compares what each one's README and code show today (November 2026).

| | **linkedin-mcp** (this project) | [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server) |
|---|---|---|
| Install | `npx` (Node 20+) | `uvx` (Python), `.mcpb` bundle, Docker or plugins |
| Create posts (text, images, PDF carousels) | Yes | No |
| Schedule posts with LinkedIn's scheduler | Yes | No |
| Your own post and profile analytics | Yes | No |
| Comment and reply to comments | Yes | No |
| React to posts | Yes | |
| Read feed, comments and notifications | Yes | Feed, yes |
| Messages and connection requests | Yes | Yes |
| Profiles, companies, people search | Yes (capped) | Yes |
| Job search | No | Yes |
| Preview and confirmation token for every send | Yes | |
| Daily and weekly caps, warm-up, working hours | Yes | |
| Automatic pause on LinkedIn security checks | Yes | |

Blank cells mean we didn't check, not that the feature is missing.

Paid tools do more in some areas (team features, hosted scheduling, CRM integrations) and cost a monthly subscription:

| Tool | What it's for | Price |
|---|---|---|
| [Taplio](https://taplio.com) | LinkedIn content, scheduling and analytics | From about $39/month |
| [Phantombuster](https://phantombuster.com) | Automation and data extraction across platforms | From about $69/month, limited free tier |
| [Expandi](https://expandi.io) | LinkedIn outreach campaigns | From about $99/month per account |

Prices are from each vendor's site in November 2026 and may have changed. linkedin-mcp is free and runs on your own computer.

## Setup

### 1. Sign in once

```bash
npx @danishfareed/linkedin-mcp login
```

A Chrome window opens on LinkedIn. Sign in as usual, including 2FA. The window closes when you're signed in. Your session is saved in `~/.config/linkedin-mcp/profile/` on your computer.

linkedin-mcp uses Google Chrome if it's installed. If not, install Chrome or run `npx patchright install chromium` once.

### 2. Add it to your AI client

Most clients use the same JSON:

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

Step-by-step instructions for each client, with paths for every OS, local HTTP mode and ChatGPT on the web, are in **[docs/clients.md](docs/clients.md)**.

### 3. Check it works

Restart your client and ask: *"Check my LinkedIn session status."* You should see your name. To check every page linkedin-mcp reads, run:

```bash
npx @danishfareed/linkedin-mcp doctor
```

**Try it safely first:** add `"env": { "LINKEDIN_MCP_DRY_RUN": "true" }` to the config above. Every write action will be previewed and simulated, but nothing is sent.

## Tools reference

All tools return JSON. Write tools return a preview and a `confirmation_token`; nothing happens until `confirm_action` is called with it, after you approve.

### Content and analytics

| Tool | What it does | Type |
|---|---|---|
| `create_post` | Publish a post now: text up to 3,000 characters, up to 9 images, or a PDF/PPTX/DOCX carousel with a title. Visibility: anyone or connections. | Write · post cap |
| `schedule_post` | Same inputs plus `publish_at`. Uses LinkedIn's own scheduler, so it publishes even when your computer is off. 15-minute slots, 30 minutes to 90 days ahead. | Write · post cap |
| `list_scheduled_posts` | Posts waiting in LinkedIn's scheduler. | Read |
| `delete_post` | Delete one of your posts. | Write |
| `get_my_posts` | Your recent posts (up to 20) with impressions, reactions, comments and reposts. | Read |
| `get_post_analytics` | Impressions, members reached, profile views, followers gained, reactions, comments, reposts, saves, sends and top viewer demographics for one of your posts. | Read |
| `get_profile_analytics` | Post impressions, followers, profile viewers and search appearances, with LinkedIn's trend for each. | Read |

### Engagement

| Tool | What it does | Type |
|---|---|---|
| `get_feed` | Recent posts from your home feed (up to 20). Promoted posts skipped. | Read |
| `search_posts` | Search posts by keywords, optionally past 24 hours, week or month (up to 20). | Read · search cap |
| `get_post_comments` | Comments and replies on a post (up to 50), each with an id for replying. | Read |
| `react_to_post` | Like, celebrate, support, love, insightful or funny. Never removes an existing reaction. | Write · reaction cap |
| `comment_on_post` | Comment on a post (up to 1,250 characters). | Write · comment cap |
| `reply_to_comment` | Reply to a specific comment. | Write · comment cap |
| `get_notifications` | Recent notifications with links (up to 30). | Read |

### Research (read-only, capped)

| Tool | What it does | Type |
|---|---|---|
| `get_person_profile` | One person's profile: name, headline, location, plus the sections you ask for (about, experience, education, skills, certifications, languages, volunteering, projects). | Read · profile-view cap |
| `get_my_profile` | Your own profile. | Read |
| `get_company_profile` | A company's overview, website, industry, size, headquarters, founding year, specialties and followers. | Read · profile-view cap |
| `search_people` | Up to 10 people: name, headline, location, profile URL, degree. Filters: network, title, company, first/last name, school. No bulk export. | Read · search cap |
| `search_companies` | Up to 10 companies. | Read · search cap |

### Network and messaging

| Tool | What it does | Type |
|---|---|---|
| `send_connection_request` | Connect with an optional note (200 characters, 300 with Premium). | Write · connection cap |
| `list_invitations` | Pending invitations, received or sent. | Read |
| `respond_to_invitation` | Accept or ignore a received invitation. | Write |
| `get_inbox` | Recent conversations with last message, time and unread status (up to 20). | Read |
| `get_conversation` | Messages in one conversation (up to 50), by thread URL or a connection's profile. | Read |
| `send_message` | Message a connection or an existing thread. | Write · message cap |

### Session and safety

| Tool | What it does |
|---|---|
| `session_status` | Signed in or not, whose account, paused or not, warm-up status. Checks the session cookie without loading a page unless you pass `verify: true`. |
| `get_limits` | Usage today and over the last 7 days against every cap, with reset times. |
| `set_limits` | Change daily caps, lower freely, or raise up to the hard ceiling. |
| `get_audit_log` | Recent write actions, guard trips and pauses. |
| `pause` / `resume` | Stop all LinkedIn activity (optionally for N minutes) and start it again. |
| `confirm_action` | Execute a previewed action with its token, after you approve. |
| `cancel_action` | Throw away a preview's token. |

## Safety model

LinkedIn's terms don't allow automation (see the [disclaimer](#disclaimer)), and accounts that behave like bots get restricted. linkedin-mcp is designed so that following the defaults keeps your activity looking like what it is: one person, using their own account, at a human pace.

### You approve everything that's sent

Every write tool returns a preview of exactly what will be sent and where, plus a single-use `confirmation_token`. The assistant must show you the preview and call `confirm_action` only after you say yes.

- Tokens expire after 10 minutes and work once.
- Each token is cryptographically bound to the exact text, target and files that were previewed, so it can't be reused for something else.
- Attached files are fingerprinted at preview time. If a file changes before you confirm, the action is refused.
- `LINKEDIN_MCP_DRY_RUN=true` simulates confirmed actions without sending anything.
- Reactions can skip confirmation if you choose (`"confirm": { "reactions": false }` in the config). Everything else always confirms.

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
- When a cap is hit, the tool says when it resets. Nothing is queued or retried behind your back.
- Attempts count, even if LinkedIn then fails, so errors can't be used to go over a cap.

### Working hours and pacing

- Write actions only run between 08:00 and 21:00 your local time by default. Reads work at any time.
- One browser, one tab, one action at a time. Consecutive actions are spaced by a randomised human-like gap (around 4 seconds typical, 1.5 to 20 seconds), with a pause after each page load and natural typing speed for comments and messages. Long posts are entered paragraph by paragraph, the way people paste a draft.
- The browser uses your system's locale and timezone. Nothing is randomised or spoofed.

### Automatic pause on security checks

After every page load, linkedin-mcp checks for CAPTCHAs, verification prompts, "unusual activity" notices, restriction pages and sign-in walls. If it sees one, it:

1. stops all tools for 24 hours (or until you resume),
2. records it in the audit log,
3. tells you how to fix it: open a visible window with `login`, resolve the check yourself, then resume.

It never tries to solve a challenge.

### Audit log

Every confirmed action is appended to `~/.config/linkedin-mcp/state/audit.jsonl` with the time, tool, target, a hash of the text and the result. The text itself isn't stored. Ask your assistant for `get_audit_log`.

### What it won't do

These are deliberately out of scope: multiple accounts, proxies, CAPTCHA solving, fingerprint spoofing, bulk scraping or exporting people's data, and mass messaging or connection campaigns. linkedin-mcp is for running your own account, not for growth hacking.

## Configuration

Settings come from environment variables (set them in your client's MCP config under `env`) or `~/.config/linkedin-mcp/config.json`. Environment variables win.

| Environment variable | Default | What it does |
|---|---|---|
| `LINKEDIN_MCP_DRY_RUN` | `false` | Simulate write actions instead of sending. |
| `LINKEDIN_MCP_HEADLESS` | `true` | `false` shows the browser window while the assistant works. |
| `LINKEDIN_MCP_WORKING_HOURS` | `08:00-21:00` | When write actions may run, local time. `off` disables the check. Overnight ranges like `22:00-06:00` work. |
| `LINKEDIN_MCP_CONFIRM_REACTIONS` | `true` | `false` lets reactions run without a confirmation step. |
| `LINKEDIN_MCP_IDLE_TIMEOUT_MINUTES` | `10` | Close the browser after this long without a tool call. |
| `LINKEDIN_MCP_BROWSER_CHANNEL` | `auto` | `auto` (Chrome if installed, else bundled Chromium), `chrome`, `chromium` or `msedge`. |
| `LINKEDIN_MCP_CHROME_PATH` | | Path to a specific Chrome executable. |
| `LINKEDIN_MCP_HOME` | `~/.config/linkedin-mcp` | Where the profile, settings and state live. On Windows the default is `%LOCALAPPDATA%\linkedin-mcp`. |
| `LINKEDIN_MCP_PORT` | `3333` | Port for `--http` mode. |
| `LINKEDIN_MCP_HTTP_TOKEN` | generated | Bearer token for `--http` mode. |

Example `~/.config/linkedin-mcp/config.json`:

```json
{
  "workingHours": { "start": "09:00", "end": "18:30" },
  "confirm": { "reactions": true },
  "limits": { "comment": 10, "connection": 5 },
  "idleTimeoutMinutes": 15
}
```

## Command line

```bash
npx @danishfareed/linkedin-mcp              # start the MCP server over stdio (what clients run)
npx @danishfareed/linkedin-mcp login        # sign in, in a visible browser window
npx @danishfareed/linkedin-mcp status       # sign-in, pause, warm-up and limits summary
npx @danishfareed/linkedin-mcp doctor       # check the browser, sign-in and every page it reads (read-only)
npx @danishfareed/linkedin-mcp resume       # clear a pause after you've resolved a LinkedIn check
npx @danishfareed/linkedin-mcp logout       # delete the saved browser profile
npx @danishfareed/linkedin-mcp --http       # local Streamable HTTP on 127.0.0.1:3333/mcp, token required
```

Other options: `--headed` (show the browser while serving), `--dry-run`, `--port <n>`, `status --verify`, `doctor --offline`, `login --keep-open`, `logout --yes`.

## FAQ

### Will my account get banned?

It can happen. LinkedIn's User Agreement prohibits automated access, and LinkedIn does restrict accounts it thinks are automated. linkedin-mcp is built to keep the risk down: it uses a real browser you signed in to yourself, does one thing at a time at a human pace, keeps daily and weekly activity under conservative caps, halves those caps for the first two weeks, only acts during working hours, and stops completely the moment LinkedIn shows a warning. It does not hide what it is or try to beat detection. The defaults are deliberately cautious, but there's no guarantee. Don't use it on an account you can't afford to lose.

### Is it really free?

Yes. It's open source under Apache-2.0, runs entirely on your computer, and has no paid tier, account or telemetry. You need an AI client that supports MCP (many have free plans) and a LinkedIn account.

### How is this different from other LinkedIn MCP servers?

Most open-source LinkedIn MCP servers focus on research: reading profiles, companies and job listings. linkedin-mcp covers research too, but it's built for running your own presence: posting, scheduling, analytics, comments, notifications, invitations and messages, with confirmation, caps and an automatic pause built in. It installs with one `npx` command (no Python). See [How it compares](#how-it-compares).

### Does it work with Sales Navigator or Recruiter?

No. It works with regular LinkedIn (free or Premium). Sales Navigator, Recruiter, company page admin, ads, job applications, polls, events and video uploads aren't supported.

### Does it store my password?

No. You sign in yourself in a normal Chrome window. linkedin-mcp only keeps the browser profile, which holds the session cookies, in `~/.config/linkedin-mcp/profile/` on your computer. Delete it any time with `logout`.

### Do scheduled posts need my computer on?

No. `schedule_post` uses LinkedIn's built-in scheduler, so LinkedIn publishes the post at the scheduled time.

### Can I run it on a server or in the cloud?

It's designed for your own computer, where you sign in and where LinkedIn already sees you. Running it from a data centre IP is far more likely to trigger LinkedIn's security checks. There's no hosted version.

### Does it work if my LinkedIn is in another language?

Reading mostly works, but buttons are found by their English labels, so actions like posting may fail with `SELECTOR_BROKEN`. Set LinkedIn's language to English for now. Contributions for other languages are welcome.

### Which AI clients does it work with?

Any client that supports local MCP servers over stdio: Claude Desktop, Claude Code, Cursor, VS Code, Devin Desktop (formerly Windsurf), Cline, the ChatGPT desktop app and others. ChatGPT on the web can't reach a server on your computer. See [docs/clients.md](docs/clients.md).

### Can I use it alongside stickerdaniel's LinkedIn MCP server?

Yes. linkedin-mcp keeps its data in `~/.config/linkedin-mcp`, separate from that server's `~/.linkedin-mcp`, so they don't share a browser profile or delete each other's files. Both are separate browser sessions on the same account, though, so LinkedIn sees the combined activity; don't run them both heavily.

## Troubleshooting

Run `npx @danishfareed/linkedin-mcp doctor` first. Common fixes:

- **`NOT_LOGGED_IN`**: run `npx @danishfareed/linkedin-mcp login`.
- **`CHECKPOINT` or `CIRCUIT_OPEN`**: LinkedIn showed a security check and everything is paused. Run `login`, resolve it in the window, then ask your assistant to `resume`. Don't retry until you have.
- **`SELECTOR_BROKEN`**: LinkedIn changed its layout. [Report it](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml) with the selector name from the error.
- **"profile is already open in another process"**: close the login window or other MCP clients using linkedin-mcp.
- **"No usable browser was found"**: install Chrome, or run `npx patchright install chromium`.

Full guide by error code: **[docs/troubleshooting.md](docs/troubleshooting.md)**.

## Contributing

The most valuable help is keeping up with LinkedIn's layout changes. Every selector lives in one file, [`src/linkedin/selectors.ts`](src/linkedin/selectors.ts), and parsers are tested against saved page snapshots, so most fixes are a few lines plus a test. See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Disclaimer

linkedin-mcp is an independent open-source project. It is not affiliated with, endorsed by or sponsored by LinkedIn Corporation or Microsoft. LinkedIn is a trademark of LinkedIn Corporation.

LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) prohibits using software to access the service in automated ways, and LinkedIn may restrict or close accounts that do. By using linkedin-mcp you accept that risk. Use it only with your own account, and follow LinkedIn's [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies). The software is provided as is, without warranty of any kind (see the licence).

## Licence

[Apache-2.0](LICENSE)
