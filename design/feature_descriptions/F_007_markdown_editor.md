---
id: F-007
title: markdown editor
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Integrate MDXEditor (with plugins for lists, quotes, tables, code blocks, links and images) as the editor for card bodies and files, with a local formatting toolbar that stays sticky at the top on mobile.

## Current state
`@mdxeditor/editor` is already installed in the app, but no editor component uses it yet. `ProjectWorkspace` edits the selected active card through a multiline MUI `TextField` and persists every change through `DataService.saveFile`; there is no shared editor surface for card dialogs, mobile accordions or text-view tabs. The app can save full markdown file content, but the UI does not yet separate markdown headers from body-only card editing.

## implementation details
- Create a reusable markdown editor component in the app and use MDXEditor with plugins for lists, quotes, tables, thematic breaks, code blocks, links and images.
- Keep persistence unchanged: editor changes produce markdown text and callers save via `DataService.saveFile` with the existing `{ path, sha, content }` contract.
- Support both full-file editing for text view ([[F-006]]) and body editing for card view ([[F-005]]); body editing must use the shared parsing service to preserve the existing frontmatter/header block and replace only the markdown body.
- Replace the current `ProjectWorkspace` textarea path with the shared editor, then reuse the same component in card dialog/mobile accordion and future file tabs.
- Add a local formatting toolbar attached to the editor; on mobile it stays sticky at the top of the scrollable editor/card body area.
- Handle empty files, header-only files, invalid markdown constructs accepted by plain text, and rapid edits without losing the existing debounced commit behavior.
- Import MDXEditor styles in the app entry/component path and keep layout consistent with the current MUI shell.

## acceptance criteria
- The selected markdown card/file is edited with MDXEditor instead of a textarea.
- Toolbar actions support lists, quotes, tables, code blocks, links and images.
- Editing persists through the existing `DataService.saveFile` and commit/push flow.
- Card body editing preserves the markdown header/frontmatter through the shared parsing service and updates only the body.
- The same editor component can be used by card view and text view without duplicating persistence logic.
- On mobile, the formatting toolbar remains sticky above the editor content while scrolling.
- Tests cover editor rendering, change propagation to `saveFile`, body-only updates with header preservation, and mobile sticky-toolbar layout state.

## see also
- `design\architecture\initial description\components.md`
- `design\architecture\initial description\app layout.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\parsing_service.md`
