---
id: B-026
title: external non-conforming files are not imported as new cards
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Data management (data management.md) requires: when loading a project — and when new files appear during usage — any markdown file that does not follow the `{id}-{title}.md` naming convention is presumed to come from an external app and must be **imported as a new feature** (header is optional in the source file). The implementation only papers over the parse: `parseCardHeader` in `app/src/services/markdown_parsing_service.ts` falls back to `DEFAULT_IMPORTED_ID = 'F-0'` and `status: new`. Nothing assigns a real next-available id, generates an `internalId`, writes the missing header back, or renames the file to the convention. Consequences:
- every non-conforming file shows as `F-0`, so multiple imports collide on the same id;
- the card has no `internalId`, so drag ordering (`after` chains) cannot reference it and delete-repair skips it;
- the fallback header lives only in memory — the repository file stays non-conforming forever, so the "import" repeats on every load;
- new files appearing during usage (watch events) are not detected as cards at all: `handleProjectWatchEvent` in `app/src/services/data_service.ts` only reacts to action-definition json changes.

## Fix
- On project load (and full background load), detect working-folder markdown files that lack a conforming name or a complete header and run an import step:
  - allocate the next available id for the default type (feature) via the existing `getNextCardNumber` logic — after the full project (including subfolders) is loaded, to avoid number reuse;
  - build/complete the header (`id`, `internalId`, `title` from first `#` heading or file name, `status: new`), preserving any header fields the file already has;
  - rename the file to `{id}-{title-slug}.md` in the working folder and commit header rewrite + rename as one import commit (respect `pushMode`).
- Extend the project watcher path so a newly appearing working-folder `.md` file triggers the same import (debounced, and ignoring writes the app itself just made).
- Surface imports to the user (e.g. workspace notice: "Imported N external files as new cards") and record a telemetry event.
- Keep the current lenient parse as the read-side fallback, but it should only ever apply transiently before the import commit lands.

## acceptance criteria
- Opening a project containing `notes.md` (no header) in the working folder produces a committed, renamed card `F-{next}-notes.md` with a complete header including a generated `internalId`; the original content is preserved as the body.
- Two non-conforming files imported together receive distinct sequential ids; ids never collide with cards in subfolders (history).
- Dropping a new markdown file into the working folder while the project is open (Electron watch) imports it the same way without a manual reload.
- Files that already conform are untouched; re-opening the project performs no repeat import.
- Import failures (e.g. commit error) are reported and leave the source file unmodified.
- Tests cover header completion, renaming, id allocation after full load, watch-triggered import, idempotency and the multi-file collision case.

## see also
- `design\architecture\initial description\data management.md`
- `design\feature_descriptions\F_002_data_management.md`
- `design\feature_descriptions\F_021_parsing_service.md`
- `design\feature_descriptions\F_026_external_change_watching.md`
