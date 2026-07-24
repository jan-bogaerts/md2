---
id: F-007
title: markdown editor
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 55bf4053-034f-411d-9c02-a790eac475ce
---

## Goal
Integrate MDXEditor (with plugins for lists, quotes, tables, code blocks, links and images) as the editor for card bodies and files, with a local formatting toolbar that stays sticky at the top on mobile.

## Current state
`@mdxeditor/editor` is installed but still not used by any component in `app/src`; every editing surface is an interim multiline MUI `TextField`. Card view ([[F-005]]) and text view ([[F-006]]) are both implemented and wired through `ProjectWorkspace`, so `ProjectWorkspace` no longer edits a card directly — it delegates to `CardView` and `TextView` and forwards their changes to `DataService`. Card body editing goes through `CardBodyEditor` (used by the desktop `CardBodyDialog` and mobile accordion), whose `onBodyChange` calls `DataService.updateCardBody`; that method already uses the shared `markdownParsingService.replaceBody` to preserve the frontmatter/header block and replace only the body. Text view edits full file content in a per-tab `TextField` and saves via the same `onBodyChange`/`DataService` path. Both `CardBodyEditor` and the text-view editor carry TODO notes that the MDXEditor component and its formatting toolbar land with F-007 and replace them. There is still no shared editor component and no formatting toolbar (sticky or otherwise).

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
