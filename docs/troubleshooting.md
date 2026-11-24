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
| `OUTSIDE_WORKING_HOURS` | A write action was asked for outside your working hours (default 08:00–21:00 local). | Try later, or change `workingHours` in `~/.linkedin-mcp/config.json`. Reads work at any time. |
| `CIRCUIT_OPEN` | Automation is paused, either by you or because LinkedIn showed a check. | See [Paused after a security check](#paused-after-a-security-check). |
| `CHECKPOINT` | LinkedIn just showed a CAPTCHA, security check, "unusual activity" or restriction page. Everything is now paused for 24 hours. | Don't retry. See below. |
| `SELECTOR_BROKEN` | A page element wasn't found, usually because LinkedIn changed its layout. | Run `doctor` and [report it](https://github.com/danishfareed/Linkedin-MCP/issues/new?template=broken-selector.yml) with the selector name from the error. |
| `CONFIRMATION_INVALID` | The confirmation token was already used, expired (10 minutes), or doesn't match. | Call the original tool again for a fresh preview. |
| `INVALID_INPUT` | Something in the request is wrong (too long, wrong URL, bad file). | The message says what to fix. |
| `TIMEOUT` | LinkedIn was slow to respond. | Try again in a minute. |
| `BROWSER_UNAVAILABLE` | Chrome couldn't start, or the profile is open elsewhere. | See [Browser won't start](#browser-wont-start). |

Arguments that don't match a tool's schema (for example a `limit` above the maximum) come back as the standard MCP "Input validation error" message instead of the JSON above.

## Paused after a security check

When LinkedIn shows a CAPTCHA, a verification prompt, an "unusual activity" notice or a restriction, linkedin-mcp stops everything for 24 hours. It never tries to solve a challenge.

1. Run `npx @danishfareed/linkedin-mcp login`. A visible browser window opens on LinkedIn with your saved session.
2. Resolve whatever LinkedIn asks for, yourself, in that window.
3. Ask your assistant to call `resume`, or run `npx @danishfareed/linkedin-mcp resume`.
4. Slow down for a few days. Lower your caps with `set_limits` if you were near them.

If the pause was only because LinkedIn signed you out, signing in again with `login` clears it automatically.

## Browser won't start

- **"No usable browser was found"**: install [Google Chrome](https://www.google.com/chrome/), or run `npx patchright install chromium` to download the bundled Chromium.
- **"The LinkedIn browser profile is already open in another process"**: only one process can use the profile at a time. Close the `login` window, or quit other MCP clients that are running linkedin-mcp, then retry. If nothing else is running, a crashed Chrome may have left a lock: reboot, or delete `~/.linkedin-mcp/profile/SingletonLock`.
- **Custom Chrome location**: set `LINKEDIN_MCP_CHROME_PATH=/path/to/chrome`, or `LINKEDIN_MCP_BROWSER_CHANNEL=chromium` to always use the bundled browser.

## Login window closes or sign-in never finishes

- Finish 2FA or the mobile-app approval in the window before closing it. The command waits up to 10 minutes.
- If LinkedIn keeps asking you to verify, sign in once in your normal browser from the same network first, then try `login` again.

## A tool returns empty results

- Run with the browser visible to see what it sees: set `LINKEDIN_MCP_HEADLESS=false` in your client config, or start with `--headed`.
- Empty notifications, inbox or invitations can be genuine. `doctor` reports these as warnings, not failures.
- linkedin-mcp is built against LinkedIn's English interface. If your LinkedIn language is set to something else, some buttons won't be found. Switching LinkedIn to English (Settings → Account preferences → Language) is the quickest fix while multi-language selectors are added.

## Scheduling fails

- LinkedIn schedules in 15-minute steps, from about an hour ahead up to three months. linkedin-mcp rounds your time up to the next 15 minutes and requires at least 30 minutes' notice.
- Times without a timezone (`2026-12-01T09:30`) are your computer's local time, which is also the timezone the browser reports to LinkedIn.

## Where things are stored

Everything lives in `~/.linkedin-mcp/` (override with `LINKEDIN_MCP_HOME`):

| Path | Contents |
|---|---|
| `profile/` | The browser profile, including your LinkedIn session cookies. Treat it like a password. |
| `config.json` | Your settings (optional). |
| `state/limits.json` | Usage counters and the warm-up start date. |
| `state/breaker.json` | Pause state. |
| `state/audit.jsonl` | One line per write action: time, tool, target, a hash of the text, result. |
| `state/account.json` | Cached name and profile URL. |
| `http-token` | Bearer token for `--http` mode. |

`npx @danishfareed/linkedin-mcp logout` deletes the browser profile. Limits history and the audit log are kept, so signing out and in again doesn't restart the counters or the warm-up.

## Still stuck?

Open an issue at https://github.com/danishfareed/Linkedin-MCP/issues with the `doctor` output. Remove names, messages and URLs from your account before posting.
