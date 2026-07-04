---
id: F-009
title: affects editor
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Provide a custom dialog to easily edit the `affects` list of a card, with a dropdown of proposed repo files filtered on what is already typed.

## Current state
`CardHeader.affects` already exists as `string[]`, and markdown parsing currently reads `affects:` frontmatter lists into card headers. That parsing should be owned by the shared parsing service before adding header rewrite behavior. New cards are created with an empty `affects` block. There is no UI for editing header fields; `ProjectWorkspace` only edits the selected card body through a textarea and saves via `DataService.saveFile`. Storage currently loads markdown files under the configured working folder only, so the app does not yet have a full repo file list for suggestions.

## implementation details
- Add a repository file listing path to the storage contract and Electron bridge so GitHub and local projects can provide normalized repo-relative paths, not only markdown files from the working folder.
- Keep `affects` values as repo-relative strings in the card header; do not resolve them to absolute local paths or GitHub URLs.
- Add parsing-service header update helpers that rewrite the `affects` frontmatter list while preserving the rest of the header and body.
- Add an affects editor dialog reachable from the card/editor UI. It shows current affected files, supports add/remove, and uses a typed file picker filtered by the current input.
- Exclude duplicate entries and the card's own file path from suggestions; allow a typed path only when it matches a known repo file.
- Persist changes through the existing `DataService.saveFile` and commit/push flow.

## acceptance criteria
- Opening the affects editor for a card shows its current `affects` values.
- Typing in the add field filters proposed repo files by path text.
- Selecting a proposed file adds it once to the card's `affects` list.
- Removing an entry updates the list without changing the card body.
- Saving rewrites the markdown frontmatter through the shared parsing service and persists through `DataService.saveFile`.
- Suggestions use normalized repo-relative paths for both GitHub and local Git projects.
- Tests cover parsing-service header rewrite behavior, duplicate/self-path exclusion, filtered suggestions, and save flow from the dialog.

## see also
- `design\architecture\initial description\overview.md`
- `design\architecture\parsing_service.md`
