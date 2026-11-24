# Changelog

All notable changes are listed here. The project follows [semantic versioning](https://semver.org/).

## 0.1.0 (unreleased)

First release.

### Tools

- 39 MCP tools for posting, scheduling, analytics, comments, reactions, notifications, research, jobs, invitations and messaging.
- Jobs: `search_jobs` (date posted, on-site/remote/hybrid, experience level, Easy Apply), `get_job_details` and `get_saved_jobs`. Read-only; linkedin-mcp never applies to jobs.
- `get_person_posts` and `get_company_posts` for someone's recent posts.
- `search_posts` can sort newest first and filter by photos, videos or documents.
- Every list tool returns `complete` and a `note` when a list may be partial, instead of returning an empty list when the page wasn't recognised.

### Official API posting (optional)

- `connect-api` connects your own LinkedIn developer app (Share on LinkedIn + Sign In with LinkedIn) through a local OAuth flow, and `create_post` then publishes text and images through LinkedIn's Posts API. `LINKEDIN_MCP_POST_VIA` chooses `auto` (default), `api` or `browser`. Hashtags stay clickable and reserved characters are escaped so text posts as written.
- `connect_linkedin_api` starts the same connection from your assistant; `session_status`, `status` and `doctor` show the days left on the 60-day connection.

### Sending safely

- Preview and single-use confirmation token for every send, with an optional dry-run mode.
- Approval in the AI client: when the client supports MCP dialogs, `confirm_action` asks the user directly, so the model can't approve its own preview.
- Sends are checked on LinkedIn afterwards and reported as `sent`, `unconfirmed` (don't retry) or `not_sent` (safe to retry).
- Buttons are looked up inside the right profile card or dialog, never page-wide, and the conversation must name the right person before a message is typed.
- Sends stop with `UNSUPPORTED_LANGUAGE` before typing anything when LinkedIn isn't set to English.
- Read-only mode (`LINKEDIN_MCP_READ_ONLY`) hides every tool that can send something.

### Protecting the account

- Daily and weekly caps with hard ceilings, a 14-day warm-up at half caps, and working hours.
- Pauses everything for 24 hours when LinkedIn shows a security check, and for the time LinkedIn asks (about 4 hours by default) when it rate-limits (HTTP 429 or 999, or a redirect loop).
- Recognises restricted accounts, the "Welcome back" account picker and pages that aren't LinkedIn (such as a Wi-Fi sign-in page).
- Append-only audit log of sends, with a hash of the text instead of the text.

### Reliability

- Each tool call has a time budget (55 seconds by default, `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`) so it answers before common client timeouts.
- Login and tools use the same browser build. An older browser is refused on a profile last opened by a newer one, because Chrome would silently drop the saved sign-in.
- Stale profile locks left by a crashed browser are removed automatically on macOS and Linux, and the browser relaunches after a crash.
- Sign-in completes from any tab of the login window.
- Dependencies are pinned and shipped with `npm-shrinkwrap.json`, so `npx` installs exactly the versions that were tested.

### Command line

- `serve` (stdio or local HTTP), `login`, `status`, `doctor`, `resume`, `install-browser`, `logout`.
- `doctor` reports the browser version in use and whether a newer linkedin-mcp is available.
- Data lives in `~/.config/linkedin-mcp` (`%LOCALAPPDATA%\linkedin-mcp` on Windows), kept apart from other LinkedIn MCP servers that use `~/.linkedin-mcp`.
