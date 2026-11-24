# Troubleshooting

Start with the built-in health check. It's read-only and uses about eight page loads:

```bash
npx @danishfareed/linkedin-mcp doctor
```

Use `doctor --offline` to check the browser and sign-in without loading any LinkedIn pages.

Every tool error has a `code`, a `message` and a `next_step`. Look up the code below.

## Error codes

| Code | What it means | What to do |
|---|---|---|
| `NOT_LOGGED_IN` | The automation browser has no LinkedIn session, or LinkedIn signed it out. | Run `npx @danishfareed/linkedin-mcp login` and sign in. |
| `LIMIT_REACHED` | A daily or weekly safety cap is used up. | Wait for the reset time in the error. Check usage with the `get_limits` tool. Caps are never queued or bypassed. |
| `OUTSIDE_WORKING_HOURS` | A write action was asked for outside your working hours (default 08:00–21:00 local). | Try later, or change `workingHours` in `~/.config/linkedin-mcp/config.json`. Reads work at any time. |
| `CIRCUIT_OPEN` | Automation is paused: by you, because LinkedIn showed a check, or because LinkedIn was rate-limiting. | See [Paused after a security check](#paused-after-a-security-check) or [Rate limited](#rate-limited). |
| `CHECKPOINT` | LinkedIn just showed a CAPTCHA, security check, "unusual activity" or restriction page. Everything is now paused for 24 hours. | Don't retry. See below. |
| `RATE_LIMITED` | LinkedIn answered with "too many requests" (HTTP 429 or 999) or a redirect loop. Everything is paused for the time LinkedIn asked for, or about 4 hours. | See [Rate limited](#rate-limited). |
| `SELECTOR_BROKEN` | A page element wasn't found, usually because LinkedIn changed its layout. | Run `doctor` and [report it](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml) with the selector name from the error. |
| `CONFIRMATION_INVALID` | The confirmation token was already used, expired (10 minutes), or doesn't match. | Call the original tool again for a fresh preview. |
| `USER_DECLINED` | You declined in the approval dialog, or the dialog wasn't answered. Nothing was sent. | Nothing to fix. Ask for a new preview if you want to change it. |
| `UNSUPPORTED_LANGUAGE` | LinkedIn's display language isn't English, so linkedin-mcp stopped before typing or clicking anything. | Set LinkedIn to English: Settings → Account preferences → Display language. Reads keep working. |
| `NOT_FOUND` | The profile, post, company or job doesn't exist or isn't visible to you. | Check the URL or name. |
| `INVALID_INPUT` | Something in the request is wrong (too long, wrong URL, bad file). | The message says what to fix. |
| `TIMEOUT` | LinkedIn was slow, or the call ran out of its time budget (55 seconds by default). The error's `stage` says where. | Try again in a minute. If your client allows longer calls, raise `LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS`. |
| `NETWORK` | The connection failed, or a different site answered (a Wi-Fi sign-in page, a proxy). | Check your connection and open linkedin.com in your normal browser. Not a LinkedIn problem, so nothing is paused. |
| `BROWSER_UNAVAILABLE` | Chrome couldn't start, or the profile is open elsewhere. | See [Browser won't start](#browser-wont-start). |

Arguments that don't match a tool's schema (for example a `limit` above the maximum) come back as the standard MCP "Input validation error" message instead of the JSON above.

## Paused after a security check

When LinkedIn shows a CAPTCHA, a verification prompt, an "unusual activity" notice or a restriction, linkedin-mcp stops everything for 24 hours. It never tries to solve a challenge.

1. Run `npx @danishfareed/linkedin-mcp login`. A visible browser window opens on LinkedIn with your saved session.
2. Resolve whatever LinkedIn asks for, yourself, in that window.
3. Ask your assistant to call `resume`, or run `npx @danishfareed/linkedin-mcp resume`.
4. Slow down for a few days. Lower your caps with `set_limits` if you were near them.

If the pause was only because LinkedIn signed you out, signing in again with `login` clears it automatically.

If LinkedIn has restricted your account, `login` stops straight away and says so instead of waiting for a sign-in that can't finish. Follow LinkedIn's instructions in your normal browser.

## Rate limited

LinkedIn sometimes answers "too many requests" (HTTP 429, or its own code 999) or sends the browser round a redirect loop. linkedin-mcp treats any of these as a rate limit: it pauses everything for as long as LinkedIn asked (its `Retry-After`), or about 4 hours if it didn't say, and returns `RATE_LIMITED` with the wait in `retry_after_seconds`.

1. Leave it. Don't call `resume` early.
2. When it lifts, lower your caps with `set_limits`, especially searches and profile views.
3. If it keeps happening, stop using linkedin-mcp for a few days.

## Browser won't start

- **"No usable browser was found"**: install [Google Chrome](https://www.google.com/chrome/), or run `npx @danishfareed/linkedin-mcp install-browser` to download the Chromium build this version of linkedin-mcp expects.
- **"The LinkedIn browser profile is already open in another process"**: only one process can use the profile at a time. Close the `login` window, or quit other MCP clients that are running linkedin-mcp, then retry. To use linkedin-mcp from several clients at once, run one shared server with `--http` ([docs/clients.md](clients.md#local-http-mode-optional)). On macOS and Linux, a lock left behind by a crashed Chrome is removed automatically; on Windows, reboot if it persists.
- **"This browser is older than the one that last opened your profile"**: Chrome silently drops saved sign-ins when an older version opens a newer profile, so linkedin-mcp refuses instead. Update Chrome, point `LINKEDIN_MCP_BROWSER_CHANNEL` at the newer browser, or run `logout` and sign in again.
- **Custom Chrome location**: set `LINKEDIN_MCP_CHROME_PATH=/path/to/chrome`, or `LINKEDIN_MCP_BROWSER_CHANNEL=chromium` to always use the bundled browser.

## Login window closes or sign-in never finishes

- Finish 2FA or the mobile-app approval in the window before closing it. The command waits up to 10 minutes, and signing in from any tab in that window counts.
- Sign in with your email and password, or a passkey. "Continue with Google" and "Sign in with Apple" usually refuse to work inside an automated browser.
- If LinkedIn keeps asking you to verify, sign in once in your normal browser from the same network first, then try `login` again.

## A tool returns empty results

- Run with the browser visible to see what it sees: set `LINKEDIN_MCP_HEADLESS=false` in your client config, or start with `--headed`.
- Empty notifications, inbox or invitations can be genuine. `doctor` reports these as warnings, not failures.
- linkedin-mcp is built against LinkedIn's English interface. If your LinkedIn language is set to something else, some buttons won't be found. Switching LinkedIn to English (Settings → Account preferences → Language) is the quickest fix while multi-language selectors are added.

## Scheduling fails

- LinkedIn schedules in 15-minute steps, from about an hour ahead up to three months. linkedin-mcp rounds your time up to the next 15 minutes and requires at least 30 minutes' notice.
- Times without a timezone (`2026-12-01T09:30`) are your computer's local time, which is also the timezone the browser reports to LinkedIn.

## Where things are stored

Everything lives in one folder: `~/.config/linkedin-mcp/` on macOS and Linux (`$XDG_CONFIG_HOME/linkedin-mcp` if you set that), `%LOCALAPPDATA%\linkedin-mcp` on Windows. Set `LINKEDIN_MCP_HOME` to use another folder. `npx @danishfareed/linkedin-mcp status` prints the one in use.

| Path | Contents |
|---|---|
| `profile/` | The browser profile, including your LinkedIn session cookies. Treat it like a password. |
| `config.json` | Your settings (optional). |
| `state/limits.json` | Usage counters and the warm-up start date. |
| `state/breaker.json` | Pause state. |
| `state/browser.json` | The newest browser version that has opened the profile. |
| `state/audit.jsonl` | One line per write action: time, tool, target, a hash of the text, result. |
| `state/account.json` | Cached name and profile URL. |
| `http-token` | Bearer token for `--http` mode. |

`npx @danishfareed/linkedin-mcp logout` deletes the browser profile. Limits history and the audit log are kept, so signing out and in again doesn't restart the counters or the warm-up.

## Still stuck?

Open an issue at https://github.com/danishfareed/Linkedin-MCP/issues with the `doctor` output. Remove names, messages and URLs from your account before posting.
