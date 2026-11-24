# Contributing

Thanks for helping. The most useful contribution is keeping up with LinkedIn's layout changes, so this guide starts there.

## Setup

```bash
git clone https://github.com/danishfareed/Linkedin-MCP.git
cd Linkedin-MCP
npm install
npm test            # unit tests, no browser or account needed
npm run lint
npm run typecheck
npm run dev -- login    # run the CLI from source
```

Node 20 or newer. To try your build in an MCP client, point it at `node /path/to/Linkedin-MCP/dist/cli.js` after `npm run build`.

## Fixing a broken selector

Every LinkedIn selector lives in [`src/linkedin/selectors.ts`](src/linkedin/selectors.ts). There are two kinds:

- **`SEL`**: elements the browser clicks or types into. Each entry is an ordered list of candidates. Prefer, in order: ARIA role plus accessible name, label, placeholder, visible text, and CSS last. LinkedIn's class names are generated and change often.
- **`EXTRACT`**: CSS used inside the page to capture snapshots (text, links, labels) of posts, comments, results and so on. Parsers in `src/linkedin/parse/` turn snapshots into data.

To fix one:

1. Reproduce it with the browser visible: `LINKEDIN_MCP_HEADLESS=false`, or `npm run dev -- --headed`.
2. Find the element in DevTools. Look for a stable `aria-label`, role or `data-*` attribute first.
3. Add the new candidate **at the top** of the list and keep the old ones. LinkedIn rolls out changes gradually, so different accounts see different layouts for weeks.
4. If a parser was wrong, capture a snapshot, replace all personal data with made-up values, save it in `tests/fixtures/`, and add a test in `tests/unit/parsers.test.ts`. See [`tests/fixtures/README.md`](tests/fixtures/README.md).
5. Run `npx @danishfareed/linkedin-mcp doctor` (or `npm run dev -- doctor`) and, if you can, `npm run smoke` against your own account. Both are read-only.

## Ground rules

These are part of what the project is, not style preferences. Pull requests that break them won't be merged.

- **Nothing is sent without a preview and an explicit confirmation.** Every write goes through `prepareWrite` and `confirm_action` in `src/tools/write.ts`.
- **Caps only go down.** Don't raise the hard ceilings in `src/safety/limits.ts` or add ways around them.
- **No anti-detection work.** No CAPTCHA solving, fingerprint spoofing, proxy rotation or multi-account support.
- **No bulk data collection.** Search stays capped at one page; no exporting lists of people.
- **Never commit personal data**, including in fixtures and issue logs.

## Pull requests

- Keep changes focused. One selector fix per PR is ideal.
- Include tests for parser and safety changes.
- `npm test`, `npm run lint` and `npm run typecheck` must pass. CI runs them on Linux, macOS and Windows.
- Describe what you saw on LinkedIn (layout, language) so others can tell whether they're affected.

## Releasing (maintainers)

1. Update `version` in `package.json` and both `version` fields in `server.json`, and add a `CHANGELOG.md` entry.
2. Commit, tag `vX.Y.Z`, push the tag. The release workflow publishes to npm with provenance and to the MCP Registry.
