---
author: 
id: F_124
internalId: dc388d9d-a25d-4e74-bc32-71325cefa426
title: add repository-folder placeholder
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__dc388d9d-a25d-4e74-bc32-71325cefa426.json#conversation=agent-3873581e-7e89-4283-a048-6b5e6f3326fa
policy:
after: 2d44bfea-2083-4ec7-b549-3fd4d02f4af9
worktree: 3
---
Separate repository root from configured project folder in action placeholders.

## Current state

- `{{project-folder}}` resolves to absolute opened repository root.
- Configured `project.projectFolder` is repository-relative but has no dedicated absolute placeholder.
- Action prompts, commands, diff commands, editor controls, and docs expose existing folder placeholders only.

## implementation details

- Add `{{repository-folder}}`, resolving to absolute opened repository root.
- Change `{{project-folder}}` to `<repository-folder>/<configured projectFolder>`. Empty `projectFolder` makes both placeholders equal.
- Keep `{{worktree-folder}}` as action execution checkout and `{{releases-folder}}` unchanged. During worktree runs, repository and project placeholders remain rooted in opened repository.
- Support new meanings in prompt and command resolution, prompt preparation, diff commands, editor insertion controls, and docs. Pass configured project folder through desktop action and diff flows.
- Update bundled templates that combine `{{project-folder}}` with repository-relative `{{card-file}}` to use `{{repository-folder}}`.
- Fail before process start when required values are missing. Cover primary checkout, linked worktree, empty/custom project folder, diff, editor, and template behavior with tests.

## acceptance criteria

- With repository `C:\Users\janbo\Documents\dev\md2` and `projectFolder: design`, `{{repository-folder}}` resolves to repository root and `{{project-folder}}` resolves to `C:\Users\janbo\Documents\dev\md2\design`.
- Empty configured project folder makes both placeholders resolve to repository root.
- Linked-worktree actions keep repository and project placeholders rooted in opened repository; `{{worktree-folder}}` still resolves to linked worktree.
- Agent prompts, action commands, and diff commands resolve both placeholders consistently.
- Editors and docs list `{{repository-folder}}` and describe distinct meanings.
- Bundled actions still resolve card paths without duplicated project-folder segments.
