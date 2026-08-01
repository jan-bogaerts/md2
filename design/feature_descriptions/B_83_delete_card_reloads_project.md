---
author: 
id: B_83
internalId: 0b35236a-2fe4-4b58-86f8-bd84af5ac7ce
title: delete card reloads project
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__0b35236a-2fe4-4b58-86f8-bd84af5ac7ce.json#conversation=agent-d3dee85b-e4fb-4763-89bc-755010c3286e
policy:
after: 0f5a1edf-4b4e-4dea-8c7a-05df83ae1288
worktree: 2
---

deleting a card currently reloads the entire project (project\_loading.ts: reloadCurrentProjectSnapshot). this shouldn't be done.

## Current state

`CardOperations.deleteCard` delegates to `ProjectFileOperations.deleteProjectFile`. Deletion flushes pending commits, repairs the following card's `after` link when needed, deletes the file, applies push mode, then calls `reloadCurrentProjectSnapshot`. That reload reads every project file and the repository index, rebuilds all cards, ensures internal IDs, and reloads agent conversations.

## implementation details

- After storage deletion succeeds, update `ProjectState` directly: merge the committed ordering-repair file, remove the deleted path from loaded files and `repositoryFiles`, and rebuild the snapshot once.
- Dispatch existing data-service change and card events so board, file tree, open documents, and selection react normally.
- Remove `reloadCurrentProjectSnapshot` from the shared file-deletion path; keep full reloads for operations that cannot derive their local result.
- Preserve pending-commit flushing, ordering repair, SHA use, auto/manual push behavior, and unchanged local state when deletion fails.
- Update `card_operations` regression tests to prove deletion performs no full project or repository-index reload.

## acceptance criteria

- Deleting a card removes it from the board, file tree, loaded files, and repository index without calling `reloadCurrentProjectSnapshot`, `loadProject`, or `listRepositoryFiles`.
- A deleted middle card's follower has the correct persisted and in-memory `after` value.
- Existing card removal/change events close or refresh affected views without reloading agent conversations.
- Failed deletion leaves the local snapshot unchanged; pending-save and push-mode behavior remains unchanged.
- Card deletion and file-tree deletion tests pass.
