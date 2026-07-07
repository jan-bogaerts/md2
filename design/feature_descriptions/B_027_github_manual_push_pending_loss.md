---
id: B-027
title: github manual-push commits are lost on reload (pending head only in memory)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The B-002 fix gave GitHub mode true manual-push semantics: `commit()` creates real commits through the Git Data API and only `push()` moves the branch ref. But the pending chain head lives solely in the in-memory `pendingCommitHeads` map (`app/src/services/github_storage_service.ts`). Consequences:

- Reloading or closing the app in manual mode orphans every unpushed commit. The commits exist server-side as dangling objects, the app forgets their sha, and GitHub eventually garbage-collects them. Silent data loss.
- `requireGithubProject` wipes the whole map whenever the active project key changes, so switching projects (or branches) discards the previous project's pending commits without warning.
- The unload flush (`ProjectWorkspace` → `flushPendingCommits`) makes it worse: it creates one final commit right before the only reference to it is dropped.

## Fix
- Persist the pending head per `owner/repo:branch` key in `localStorage` (next to `md2.lastProject`). Write it whenever `createPendingCommit` updates the map; remove it on successful `push()`. Store the base branch sha the chain was built on alongside the head sha.
- On project open in manual mode, when a stored pending head exists for the project key:
  - verify via the API that the pending commit still exists and that the current remote branch head equals the stored base sha;
  - if both hold, restore it as the in-memory pending head and show an "unpushed commits" indicator (status bar, like `hasPendingCommits`);
  - if the branch moved or the commit is gone, surface a clear conflict message with an explicit "discard pending commits" choice — never silently adopt either side and never force-push.
- Stop clearing other projects' entries on project switch; the map (and storage) is keyed per project, entries are independent.
- Extend the existing `beforeunload` confirmation to also trigger when unpushed manual-mode commits exist, not only when the commit batcher holds files.

## acceptance criteria
- Editing in manual mode, reloading the app and reopening the project restores the unpushed chain; `push()` then moves the branch ref to include all of it.
- Switching to another project and back does not lose the pending head of either project.
- When the remote branch advanced while commits were pending, the user is warned and can discard; no force-push happens.
- Closing the app with unpushed manual-mode commits shows the leave-confirmation.
- Auto-push mode behavior is unchanged.
- Tests cover the localStorage round-trip, restore-with-verification, the branch-moved conflict path, discard, and clear-on-push.

## see also
- `design\feature_descriptions\B_002_github_push_semantics.md`
- `design\feature_descriptions\F_002_data_management.md`
