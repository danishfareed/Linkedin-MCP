# LinkedIn MCP Server: Design

Date: 24 Nov 2026 · Status: draft for owner approval · Repo: github.com/danishfareed/Linkedin-MCP

## 1. Intent

A free, open-source MCP server that lets anyone run their own LinkedIn account from an AI assistant (Claude, Cursor, VS Code, ChatGPT desktop and others). It works through browser automation, with no official API and no paid service.

**Why it exists:** creators, founders and job seekers who can't pay for tools like Taplio, Shield, Phantombuster or Expandi still want help posting, scheduling, reading their analytics and keeping up with engagement. The leading open-source option, stickerdaniel/linkedin-mcp-server (about 4.3k stars, Python), is built for research and outreach. It can't post, schedule, read your own analytics or reply to comments, and it needs Python and `uv`.

**What "better" means here:**
1. **Creator tools first:** post, schedule, analytics, comments and engagement.
2. **Safer by design:** human-paced actions, hard caps, confirmation before anything is sent, and automatic backoff when LinkedIn shows a warning.
3. **Easier install:** one line, `npx @danishfareed/linkedin-mcp`.
4. **Research parity:** profiles, companies and people search, read-only.
5. **Documentation people can actually follow,** written so the README ranks for "LinkedIn MCP server" searches.

## 2. Goals, non-goals, anti-goals

**Goals**
- Run one person's own account: their posts, analytics, inbox, network and engagement.
- Work in every major MCP client over stdio, with optional local HTTP.
- Survive LinkedIn UI changes, by keeping selectors in one place and catching breakage with fixture tests.
- Be safe enough that a normal user following the defaults is unlikely to get restricted.

**Non-goals (v1)**
- Sales Navigator, Recruiter, job auto-apply, company page admin, ads, video upload, polls and events.
- A hosted or cloud version.

**Anti-goals (never build; these are failure even if they work)**
- Multi-account management, proxy rotation, CAPTCHA solving, fingerprint spoofing.
- Bulk scraping of other people's data (exporting search results or employee lists at scale).
- Mass unsolicited messaging or connection campaigns.
- Any way to send a message, comment, post or invitation without the user seeing and confirming it.

The project is a tool for running *your own* account. Features that only make sense for spam or data harvesting are out.

## 3. Constraints

- Node 20+. Distributed on npm as `@danishfareed/linkedin-mcp`, with bin name `linkedin-mcp`.
- No native-compiled dependencies, so `npx` works everywhere (no `better-sqlite3`). State uses JSON files with atomic writes.
- Browser layer: `patchright` (the Node package, a drop-in Playwright replacement). It uses installed Google Chrome (`channel: "chrome"`) when present, otherwise Patchright's bundled Chromium.
- One persistent browser profile per install at `~/.linkedin-mcp/profile/`. The user logs in themselves in a visible window. No cookie import from other browsers.
- Licence: Apache-2.0 (already in the repo).
- Commits, docs and the README never credit AI tools.
- LinkedIn's User Agreement prohibits automated access. The README states this plainly, along with the risk.

## 4. Approaches considered

| Approach | Trade-offs | Decision |
|---|---|---|
| **A. TypeScript + Patchright (Node) + npx** | One-line install for most MCP users. Same browser-level stealth as the leading Python project. Large Playwright ecosystem. Needs a TS build step. | **Chosen** |
| B. Python + Patchright (same as stickerdaniel) | Fastest to prototype, but a me-too on the same stack, and the Python/`uv` install burden is what we want to remove. | Rejected |
| C. Chrome extension bridge + MCP | Uses the person's real everyday Chrome session, but users install two things and the build is roughly double. | Later (v2 candidate) |

The owner chose A, with stealth via Patchright.

## 5. Architecture

```
MCP client (Claude, Cursor, VS Code…)
        │ stdio (default) or local HTTP
┌───────▼────────────────────────────────────────────┐
│ server     tool registry, zod schemas, MCP SDK      │
│ tools/*    one file per tool group                  │
│ safety/    confirm · limits · pacing · guard · audit│
│ linkedin/  page objects + selectors + parsers       │
│ browser/   patchright persistent context, lifecycle │
│ state/     JSON stores in ~/.linkedin-mcp/          │
└─────────────────────────────────────────────────────┘
```

### 5.1 Repository layout

```
src/
  cli.ts                 # bin entry: serve (default), login, logout, status, doctor
  server.ts              # builds MCP server, registers tools, transport
  config.ts              # env vars + ~/.linkedin-mcp/config.json
  browser/
    session.ts           # launch/reuse persistent context, idle close, single-flight lock
    human.ts             # delays, typing cadence, scrolling (pacing primitives)
  safety/
    confirm.ts           # draft → confirmation token → execute
    limits.ts            # per-action daily/weekly counters, caps, warm-up, working hours
    guard.ts             # detects checkpoint/captcha/restriction pages → circuit breaker
    audit.ts             # append-only JSONL log of every write action
  linkedin/
    selectors.ts         # ALL selectors, role/aria-first with fallbacks, one place to fix
    urls.ts
    parse/*.ts           # pure functions: HTML/text → typed objects (unit-tested on fixtures)
    pages/*.ts           # page objects: feed, composer, scheduler, profile, company,
                         #   search, notifications, messaging, analytics, invitations
  tools/
    session.ts content.ts analytics.ts engagement.ts research.ts network.ts
    messaging.ts safety.ts
  state/store.ts         # atomic JSON read/write, file lock
tests/
  unit/*.test.ts         # vitest
  fixtures/*.html        # sanitized saved LinkedIn pages for parser tests
scripts/smoke.ts         # manual live read-only check against a real account
docs/                    # design, plan, per-client setup guides, troubleshooting
```

### 5.2 Browser session

- A persistent context at `~/.linkedin-mcp/profile`. `linkedin-mcp login` opens a **headed** window. The user signs in, completing 2FA or app confirmation by hand, then closes it. Afterwards the server runs **headless** by default (`LINKEDIN_MCP_HEADLESS=false` shows the window).
- A single browser for the whole process, with a mutex so tool calls run one at a time. LinkedIn sees one human, not parallel tabs.
- Closes after 10 minutes idle (configurable). Relaunches on the next call.
- Viewport, locale and timezone come from the user's system, not randomised.
- `session_status` checks login state without heavy navigation.

### 5.3 Safety layer

**Confirmation (`confirm.ts`).** Every tool that sends or changes something on LinkedIn (post, schedule, comment, react, reply, connect, accept, message, delete) runs in two steps:
1. The tool call validates input, renders a **preview** (exact text, target, attachments) and returns `{ preview, confirmation_token, expires_at }`. Nothing is sent.
2. `confirm_action(confirmation_token)` executes it. Tokens are single-use, bound to a hash of the exact parameters, and expire after 10 minutes. The tool descriptions tell the model to show the preview to the user and only confirm after the user says yes.
- `LINKEDIN_MCP_DRY_RUN=true` makes `confirm_action` simulate the action without sending.
- Reactions can opt out of confirmation (`confirm.reactions=false` in config), because they're low-risk and high-volume. Everything else always confirms.

**Limits (`limits.ts`).** Counters persist in `~/.linkedin-mcp/state/limits.json`.

| Action | Default per day | Hard ceiling per day | Weekly ceiling |
|---|---|---|---|
| Posts (published or scheduled) | 2 | 3 | 15 |
| Comments / replies | 15 | 30 | 150 |
| Reactions | 40 | 100 | 500 |
| Connection requests | 10 | 20 | 80 |
| Messages | 15 | 30 | 150 |
| Profile views (research) | 40 | 80 | 400 |
| Searches | 15 | 30 | 150 |
| Page loads overall | 300 | 500 | - |

- Users can lower defaults freely. They can raise them up to the hard ceiling, never above it.
- **Warm-up:** for the first 14 days after first login, effective caps are 50%.
- **Working hours:** write actions only run between 08:00 and 21:00 local time by default (configurable). Outside those hours they return a clear refusal.
- When a cap is hit, the tool returns a structured error with the reset time. It never queues silently.

**Pacing (`human.ts`).** Random log-normal delays between actions (median about 4s, clamped 1.5 to 20s), a pause of 1 to 4s after each navigation, per-character typing at a natural speed with occasional pauses, and smooth scrolling before reading feed content. This is pacing, not disguise: it keeps the volume and rhythm human.

**Guard (`guard.ts`).** After every navigation it checks for checkpoint, CAPTCHA, "unusual activity", restriction or login-wall pages. On a hit it trips a **circuit breaker**: all tools refuse for 24 hours, or until `resume` after the user resolves the issue in a headed window. It also logs to the audit log and returns instructions. It never tries to solve a challenge.

**Audit (`audit.ts`).** Every confirmed write action is appended to `~/.linkedin-mcp/state/audit.jsonl` (time, tool, target, text hash, result).

### 5.4 Selectors and resilience

- All selectors live in `linkedin/selectors.ts`, preferring role, aria-label and visible text over CSS classes (LinkedIn's classes are obfuscated and change). Each entry has an ordered fallback list.
- Parsing is split from navigation. `parse/*.ts` are pure functions over page HTML or extracted text, tested against sanitized fixtures in `tests/fixtures/`.
- When a selector fails, the tool returns `SELECTOR_BROKEN` with the selector name and a link to "report a broken selector". `doctor` runs every read-only page object and reports which ones break.

### 5.5 Tools (v1)

All return structured JSON. Every write tool follows the preview → `confirm_action` flow from 5.3.

**Session and safety**
- `session_status`: whether you're logged in, your name and profile URL, whether the circuit breaker is tripped, and whether you're in warm-up.
- `get_limits`: usage against caps for today and this week, plus reset times.
- `set_limits`: change defaults within the ceilings.
- `get_audit_log`: recent write actions.
- `pause` / `resume`: manual circuit breaker.
- `confirm_action(token)`: executes a previewed write.

**Content (creator core)**
- `create_post`: text (up to 3,000 characters), optional images (up to 9), or a PDF document with a title (carousel). Visibility: anyone or connections. Write.
- `schedule_post`: same inputs plus `publish_at`, using LinkedIn's own scheduler in the composer, so it publishes even when the computer is off. Write.
- `list_scheduled_posts`: read.
- `delete_post(post_url)`: write.
- `get_my_posts(limit≤20)`: recent own posts with impressions, reactions, comments and reposts.
- `get_post_analytics(post_url)`: impressions, members reached, reactions, comments, reposts, and top demographics where LinkedIn shows them.

**Analytics**
- `get_profile_analytics`: profile views, search appearances, followers and post impressions, over the windows LinkedIn shows.

**Engagement**
- `get_feed(limit≤20)`: read.
- `search_posts(keywords, date_posted, limit≤20)`: read. Counts as a search.
- `get_post_comments(post_url, limit≤50)`: read.
- `react_to_post(post_url, reaction)`: write (confirmation optional, see 5.3).
- `comment_on_post(post_url, text)`: write.
- `reply_to_comment(post_url, comment_id, text)`: write.
- `get_notifications(limit≤30)`: read.

**Research (read-only, capped)**
- `get_person_profile(url_or_username, sections[])`: counts as a profile view.
- `get_my_profile`.
- `get_company_profile(url_or_slug)`.
- `search_people(keywords, filters, limit≤10)`: returns name, headline, URL and degree only. No bulk export.
- `search_companies(keywords, limit≤10)`.

**Network**
- `send_connection_request(profile, note?)`: write. The note is limited to 200 characters (300 with Premium; detected).
- `list_invitations(direction: received|sent)`.
- `respond_to_invitation(id, accept|ignore)`: write.

**Messaging**
- `get_inbox(limit≤20)`, `get_conversation(thread_or_profile, limit≤50)`.
- `send_message(profile_or_thread, text)`: write.

### 5.6 CLI

```
npx @danishfareed/linkedin-mcp            # start MCP server over stdio (default)
npx @danishfareed/linkedin-mcp login      # headed sign-in, saves profile
npx @danishfareed/linkedin-mcp status     # session + limits summary
npx @danishfareed/linkedin-mcp doctor     # checks Chrome, profile, selectors (read-only)
npx @danishfareed/linkedin-mcp logout     # deletes the saved profile after confirming
  --http [--port 3333]                    # local streamable HTTP, bound to 127.0.0.1, token required
```

Configuration comes from env vars (`LINKEDIN_MCP_*`) and/or `~/.linkedin-mcp/config.json`. Env vars win.

### 5.7 Errors

Every tool error has a `code` (`NOT_LOGGED_IN`, `LIMIT_REACHED`, `OUTSIDE_WORKING_HOURS`, `CIRCUIT_OPEN`, `SELECTOR_BROKEN`, `CONFIRMATION_INVALID`, `CHECKPOINT`, `TIMEOUT`, `INVALID_INPUT`), a human message, and `next_step` text the assistant can relay.

## 6. Testing

- **Unit (vitest):** confirm tokens (binding, expiry, single use), limits (caps, ceilings, warm-up, week rollover, working hours), pacing bounds, the guard's page classification, every parser against fixtures, and the CLI argument parsing.
- **Fixtures:** saved LinkedIn pages with personal data replaced. Contributors add one when they fix a selector.
- **Smoke (`npm run smoke`):** manual, against a real logged-in account, read-only tools only. Never in CI.
- **CI (GitHub Actions):** lint (eslint), typecheck, unit tests on Node 20 and 22 for Linux, macOS and Windows.

## 7. Release and distribution

- Semantic versioning. Tag `v*`, and GitHub Actions publishes to npm with provenance.
- A listing in the official MCP Registry (`server.json`), plus Smithery and Glama. An `.mcpb` bundle for one-click Claude Desktop install is a later step.
- GitHub topics: `mcp`, `mcp-server`, `linkedin`, `linkedin-automation`, `model-context-protocol`, `claude`, `cursor`, `ai-agent`, `linkedin-scheduler`, `open-source`.

## 8. README (SEO and usefulness)

- **Title and first line:** "LinkedIn MCP Server: free, open-source LinkedIn automation for Claude, Cursor and any AI agent". Include the keywords "LinkedIn MCP", "LinkedIn automation", "schedule LinkedIn posts" and "LinkedIn analytics" naturally in the first 150 words.
- **Sections:** a one-line install; what you can do (example prompts); a comparison table against stickerdaniel/linkedin-mcp-server and paid tools (facts only, linked); setup per client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Cline, ChatGPT desktop); a full tools reference; the safety model (confirmation, limits, warm-up, guard); configuration; FAQ ("Will my account get banned?", "Is this free?", "How is it different from…", "Does it work with Sales Navigator?"); troubleshooting; contributing (especially fixing selectors); disclaimer; licence.
- A demo GIF at the top (recorded after v0.1 works).
- Never credits AI tools.

## 9. Decided by the owner

- Open source, Apache-2.0, at github.com/danishfareed/Linkedin-MCP.
- Browser automation only, no official APIs.
- Patchright stealth is wanted.
- The goal is to be better than stickerdaniel's server, with a very detailed, SEO-optimised README.
- No AI credit in commits or docs.

## 10. Calls made by the designer (owner to check)

- Package name `@danishfareed/linkedin-mcp` (`linkedin-mcp` is taken on npm).
- A creator-first v1 scope with jobs, Sales Navigator, polls, video and company pages left out.
- The confirmation-token flow, rather than a `confirm: true` flag, so the model can't skip the preview.
- The limit numbers in 5.3.
- Default working hours of 08:00 to 21:00.
- Reactions can skip confirmation if the user configures it.

## 11. Left to the builder

- Exact selector strategies, discovered against live LinkedIn and recorded in `selectors.ts`.
- Which MCP TypeScript SDK API to use (the current release is 1.32; use its recommended server class).
- Internal module boundaries below the layout in 5.1.
- Exact wording of tool descriptions, within the confirmation rules.
