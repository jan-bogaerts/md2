---
id: B-032
title: github manual-push mode reads stale remote content after reload
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Residual gap after the B-027 fix (found in the 2026-07-07 implementation audit). `restorePendingCommits` correctly restores the pending commit head from `localStorage` when a manual-push project is reopened, and new commits stack on that head (`getBranchHead` is pending-aware). But **all reads resolve the tree from the remote branch ref**, never from the pending head:

- `getProjectRecursiveTreeEntries` (`app/src/services/github_storage_service.ts`) calls `getRemoteBranchTreeSha`, which reads `git/ref/heads/{branch}` directly;
- `loadProject`, `loadProjectRoot` (`readDirectory`/`readRootMarkdownFiles`), `listRepositoryFiles`, `listTopLevelFolders` and `loadActionFiles` all go through it.

Consequences after an app reload in manual mode with unpushed commits:

- the UI shows the **old remote content**, not the state the user last saw;
- the in-memory file shas come from the remote tree while the pending head's tree has newer shas, so every save of a file touched by a pending commit fails the `assertPathShasMatch` guard with "The file changed remotely" — the project is effectively read-only for those files until the user pushes;
- nothing is lost (the pending chain is intact and push still works), but the manual-push workflow breaks on every restart.

## Fix
- Route project reads through the pending-aware head: when `pendingCommitHeads` has an entry for the project/branch, `getProjectRecursiveTreeEntries` must use the pending head commit's tree sha (same resolution `getBranchHead` already does) instead of the remote ref.
- Keep the existing conflict detection in `restorePendingCommits` (remote ref moved ⇒ `GithubPendingCommitConflictError`) — this fix only changes which tree reads use after a successful restore.
- Make sure the tree cache key still distinguishes remote-head and pending-head trees (it already includes the tree sha, so switching the source sha is enough).
- Verify `push()` then reload shows the same content as before the push (no double-application).

## acceptance criteria
- In manual-push mode: edit a card, let it auto-commit, reload the app — the card shows the edited content, and further edits commit without a false "changed remotely" error.
- `listRepositoryFiles`/`listTopLevelFolders`/action loading reflect files added by pending commits after a reload.
- A genuine remote change under pending commits still raises the pending-conflict error on open.
- Pushing pending commits and reloading yields identical content to the pre-push state.
- Regression test: commit → simulate reload (new service instance restoring from storage) → `loadProjectRoot` returns pending content and a follow-up `commit()` succeeds.

## see also
- `design\feature_descriptions\ready\B_027_github_manual_push_pending_loss.md`
- `design\feature_descriptions\ready\B_002_github_push_semantics.md`
