# Security

## Reporting a vulnerability

Please report security problems privately through [GitHub's private vulnerability reporting](https://github.com/danishfareed/Linkedin-MCP/security/advisories/new), not in a public issue. You'll get a reply within a week.

## What linkedin-mcp protects

- **Your LinkedIn session.** The browser profile in `~/.linkedin-mcp/profile/` holds your session cookies. It's created with owner-only permissions. Anyone who can read it can act as you on LinkedIn, so treat it like a password. `linkedin-mcp logout` deletes it.
- **No password storage.** You sign in yourself in a visible browser window. linkedin-mcp never sees or stores your password.
- **Nothing leaves your machine** except the browser's normal traffic to LinkedIn. There is no telemetry and no hosted component.
- **Human confirmation for every write.** Posts, comments, replies, reactions, connection requests, invitation responses, messages and deletions need a single-use token from a preview the user has seen. Tokens expire after 10 minutes and are bound to the exact parameters.
- **Uploads are restricted.** Only real JPG, PNG and GIF images and PDF, PPTX, PPT, DOCX and DOC documents (checked by extension and file signature), within size limits. Files inside `~/.linkedin-mcp`, `~/.ssh`, `~/.aws`, `~/.gnupg` and similar folders are refused even through symlinks, and a file that changes after the preview is refused.
- **HTTP mode is local only.** `--http` binds to 127.0.0.1, requires a bearer token, and rejects requests whose Host header isn't localhost (DNS-rebinding protection).

## Prompt injection

Feed posts, comments, messages and profiles are written by other people and are passed to your AI assistant as data. Someone could write a post designed to manipulate an assistant. The confirmation step is the main defence: nothing is sent unless you approve the preview. Read previews before approving them, especially messages and connection notes.
