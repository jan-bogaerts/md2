---
id: B-001
title: github commits fail after first auto-save (stale sha)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
In GitHub mode, the second delayed commit of the same file fails with 409/422. `GithubStorageService.writeFile` (`app/src/services/github_storage_service.ts`) discards the PUT response, which contains the file's **new** blob sha. `DataService.saveFile` keeps the old sha in `currentFiles`, so the next contents PUT for that file sends a stale `sha` and GitHub rejects it. Every GitHub editing session breaks after the first auto-commit of a given file.

## Fix
- `writeFile` reads the response json (`content.sha`) and returns the updated `{ path, sha }`.
- `commit()` returns the updated shas; `DataService.commitFiles` (the commit-batcher sink) merges them back into `currentFiles` and the snapshot.
- Handle a 409/422 that still occurs (true remote conflict) with a clear error telling the user the file changed remotely, instead of a generic status error.
- Local Git mode is unaffected (no shas) — the merge step must be a no-op there.

## acceptance criteria
- Editing the same card continuously in GitHub mode produces successive successful commits (verified with a mocked fetch asserting the second PUT carries the sha returned by the first).
- After any commit, `DataService` state carries the fresh shas.
- A genuine remote conflict surfaces a clear user-visible error.
- Regression test covers two sequential commits of one file.

## see also
- `design\feature_descriptions\F_002_data_management.md`
