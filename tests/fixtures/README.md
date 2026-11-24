# Parser fixtures

Each file here is a **snapshot**: the visible text, links, ARIA labels and a few
named sub-element texts that `src/linkedin/dom.ts` reads from a LinkedIn page.
Parsers in `src/linkedin/parse/` are pure functions over these snapshots, so
they can be tested without a browser or an account.

All names, companies, URLs and numbers are made up. Never commit real personal
data.

## Adding or updating a fixture

When you fix a broken selector:

1. Reproduce the page in a logged-in browser and run the extractor for the
   relevant spec in `EXTRACT` (see `src/linkedin/selectors.ts`).
2. Replace every real name, headline, company, URL slug, URN and message with
   made-up values. Keep the structure (line order, duplicates, labels) intact,
   because that structure is what the parser depends on.
3. Save it here and add a test in `tests/unit/parsers.test.ts`.

Some fixtures leave `fields` empty on purpose. They exercise the text-only
fallback that keeps parsers working when LinkedIn renames its CSS classes.
