# Dev Log — OMG.lol Publisher

---

## v2.7.0 — 2026-06-11 (in progress)

### Weblog import from omg.lol
- New command: **"Import Weblog Posts from omg.lol"** — fetches all existing weblog entries via `GET /address/{username}/weblog/entries` in a single API call and creates local notes for each one
- Full frontmatter is written on import: `entry` (ID for future publish/update), `slug`, `title`, `date` (converted from Unix timestamp to YYYY-MM-DD), `status` (API `live` → `published`, `draft` → `draft`), and `tags` (parsed from the `Tags:` line in the raw `source` field)
- Body content comes from the `body` field (clean markdown, no frontmatter), so no stripping needed
- Duplicate guard: skips any entry whose `entry` ID already exists in the vault, and also skips if the target file path already exists
- Posts land at `basePath/posts/yyyy/mm/YYYY-MM-DD_slug.md` (or `slug.md` if auto-renaming is disabled)
- Pages land at `basePath/pages/slug.md` — no date subfolder, and `type: page` is added to frontmatter
- Path resolution order: new **Import base path** setting → existing **Base folder path** (auto-organize) → prompt modal at import time
- New **Import base path** setting added to Weblog Settings — always visible (not gated on auto-organize toggle), with folder browser button
- Final notice shows count of imported vs. skipped posts

---

## v2.6.0 — 2026-05-08

### paste.lol wikilink support
- `[[note]]` wikilinks in weblog posts now resolve to paste.lol URLs when the linked note has `paste_url` or `paste_id` frontmatter (i.e. it's been published as a paste)
- Resolution priority in `resolveWikilinks`: weblog slug → paste URL → plain text
- If `pastebinBaseUrl` is set in settings, links are built from `pastebinBaseUrl + paste_id`; otherwise falls back to the stored `paste_url` directly

### paste.lol custom domain setting
- Added `pastebinBaseUrl` to `PastebinSettings` (defaults to `""`)
- New "Paste base URL" field in Settings tab under paste.lol section — same pattern as the existing "Weblog base URL" setting
- The paste toggle now calls `this.display()` so the settings section shows/hides correctly when toggled

### paste publisher respects custom domain
- `PasteBinPublisher` now accepts `pastebinBaseUrl` as a constructor argument
- `paste_url` written to frontmatter after publishing uses the custom domain if set, otherwise falls back to `https://username.paste.lol`
- This means the frontmatter `paste_url` is always a correct, shareable link

### Weblog wikilinks — page URL fix
- `[[note]]` links pointing to a note with `type: page` in frontmatter no longer get the date-based path prefix (e.g. `/2026/05/08/`) applied — pages resolve to `base/slug` directly since they live at the root on weblog.lol

### Housekeeping
- Fixed trailing comma in `versions.json` that was breaking the version-bump script
- Bumped version to 2.6.0 via `npm version`

---

## Post-release fixes — 2026-05-08

### some.pics — alt text and caption pre-fill
- `resolveImageFromContext()` now captures the existing alt text from `![alt text](url)` markdown syntax and passes it to the upload modal as a pre-fill — no more losing alt text you already wrote
- If image brackets are empty `![](url)`, alt text field starts blank
- Checks the line immediately after the image for `*italic caption text*` (single asterisks) and pre-fills the description field with the plain text — matches Eric's CSS convention for image captions
- GPT alt text generation is now opt-in: removed auto-generation on submit, added a "Generate" button next to the alt text field (only shown when a ChatGPT API key is configured)

### paste.lol — publish any file type without fenced code block
- Removed hard requirement for content to be wrapped in a fenced code block
- Non-markdown files (`.css`, `.sh`, `.js`, etc.) now publish their raw content directly
- Markdown files with a fenced block still use the block content as before; markdown files without one now fall back to the full body rather than throwing a silent error

### Template confirm modal — correct button labels
- `confirmTemplateAction()` shared modal was always showing "Delete" regardless of the action
- Added a `confirmLabel` parameter: overwriting the main template shows "Update", overwriting a named template shows "Overwrite", deleting shows "Delete"
