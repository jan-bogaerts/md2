---
id: B-062
title: action architecture links broke after document move
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: false
---

## Problem

`action_editor.md` and `running_actions.md` moved directly into `design/architecture/initial description/writings/`, but their cross-links still target removed `Action editor/` and `Running actions/` subfolders. Readers navigating either architecture note reach missing files.

## Fix

- Change the two links to sibling-relative targets:
  - `action_editor.md` links to `running_actions.md`;
  - `running_actions.md` links to `action_editor.md`.
- Search all Markdown files for old moved paths, including case variants and encoded-space variants, and update verified stale references.
- Do not change architecture decisions or document requirements in this card.
- Add/use a repository-local Markdown link checker if one already exists. If none exists, keep this card to link repair; propose tooling separately rather than adding a new dependency implicitly.

## acceptance criteria

- Both architecture notes link to each other successfully from their current locations.
- No repository Markdown reference targets removed action-editor/running-actions subfolders.
- Valid references and architecture content remain unchanged.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- `design\architecture\initial description\writings\running_actions.md`
