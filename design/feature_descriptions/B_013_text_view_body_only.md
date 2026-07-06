---
id: B-013
title: text view edits body only, not the full file
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
F-007 specifies "full-file editing for text view and body editing for card view". `TextView` feeds `activeCard.content` (header already stripped by the parsing service) into `MarkdownEditor` and saves through `updateCardBody` — the frontmatter header is invisible and uneditable in file mode. Header mistakes (wrong status, typo'd id) can't be fixed anywhere in the app.

## Fix
- Text view tabs edit the raw file content (`MarkdownFile.content`), saving through `DataService.saveFile` directly.
- MDXEditor doesn't understand frontmatter, so either:
  - render a compact header editor panel above the body editor (key/value grid backed by the parsing service's rewrite helpers) with the body in MDXEditor below — keeps parsing centralized (recommended); or
  - use MDXEditor's frontmatter plugin if it round-trips the header format acceptably.
- Card view behavior (body-only, header preserved) stays unchanged.
- Guard against destructive round-trips: saving from text view must not lose or reorder unknown header fields (parsing-service ownership per F-021).

## acceptance criteria
- Header fields of an open file are visible and editable in text view; changes persist through the normal save/commit flow.
- Unknown/extra header fields survive a text-view edit unchanged.
- Card view still edits only the body.
- Tests cover header display, header edit persistence and unknown-field preservation.

## see also
- `design\feature_descriptions\F_007_markdown_editor.md`
- `design\feature_descriptions\F_021_parsing_service.md`
