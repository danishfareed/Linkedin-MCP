# Changelog

All notable changes are listed here. The project follows [semantic versioning](https://semver.org/).

## 0.1.0 (unreleased)

First release.

- 33 MCP tools for posting, scheduling, analytics, comments, reactions, notifications, research, invitations and messaging.
- Preview and confirmation-token flow for every write action, with an optional dry-run mode.
- Daily and weekly caps with hard ceilings, a 14-day warm-up at half caps, and working hours.
- Guard that pauses everything for 24 hours when LinkedIn shows a security check.
- Append-only audit log of write actions.
- CLI: `serve` (stdio or local HTTP), `login`, `status`, `doctor`, `resume`, `logout`.
- Data lives in `~/.config/linkedin-mcp` (`%LOCALAPPDATA%\linkedin-mcp` on Windows), kept apart from other LinkedIn MCP servers that use `~/.linkedin-mcp`.
