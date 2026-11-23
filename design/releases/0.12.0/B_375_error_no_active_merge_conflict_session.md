---
author: 
id: B_375
internalId: 61bfe480-a372-4927-84d6-a26973fc8c66
title: Error: No active merge conflict session
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__61bfe480-a372-4927-84d6-a26973fc8c66.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 161833899
sentryOrganization: elastetic
after: f5778432-59ae-4f09-a254-7b450bf873a1
changedFiles:
  - app/src/services/project/merge_conflict_service.node.test.ts
  - app/src/services/project/merge_conflict_service.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_loading.ts
---

## Current state

The desktop owns the active merge conflict session for one paused Git rebase or worktree integration. The renderer keeps a snapshot of that session to display the conflict dialog.

When the desktop reports that the session ended, the renderer ignores the null session until it reloads the paths that were conflicted. This reload only applies to card Markdown in the configured project folder; other source files are ignored. The explicit reload is needed because project file watcher events are suppressed while a path is conflicted, preventing conflict markers from entering the card model.

While the reload is pending, the renderer still exposes the ended session and leaves the conflict dialog interactive. Continuing during that interval reaches the desktop after its session has already been cleared and produces `No active merge conflict session`.

## Implementation details

Close the renderer session immediately when the desktop reports that it ended. Capture the accumulated conflicted paths first, clear the session snapshot and affected-path tracking, and let the conflict dialog close without waiting for project data to reload.

After closing the session, reload the captured paths when project storage is available. `ProjectLoading.reloadConflictPaths` must retain its current filtering, so only affected card Markdown is reloaded and ordinary source files require no renderer work. Report reload failures through the existing error path, but do not restore an ended session or reopen the conflict dialog.

Use one idempotent session-closing path for desktop null events, successful Continue, successful Cancel, and verification that finds no active desktop session. This path must consume the captured paths once so concurrent notifications do not cause duplicate reloads. Preserve the existing integration activity and branch-cleanup processing after a successful Continue.

Add focused service tests for immediate session closure, asynchronous card reload, ignored source paths, reload failure, and duplicate end notifications. The tests must also verify that Continue cannot be sent for a session after the desktop has reported it ended.

## Acceptance criteria

- The conflict dialog closes as soon as the desktop reports that the merge conflict session ended.
- Closing the dialog does not wait for affected files to reload.
- A user cannot Continue or Cancel an ended session.
- Affected card Markdown is reloaded after the dialog closes because its watcher events were suppressed during the conflict.
- Conflicted files outside the configured project folder are not reloaded into renderer state.
- A card reload failure is reported without restoring the ended session or reopening the dialog.
- Multiple end notifications close and reload the session only once.
- Successful Continue still records integration activity and performs branch cleanup.

## Sentry issue

**Title:** Error: No active merge conflict session

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/161833899/)

**First seen:** 2026-11-17T13:16:53Z

**Last seen:** 2026-11-17T13:16:53Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Dre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js)

**Event ID:** ff3e493808aa4f1289bd9d6f7c04954b

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:2611:15162` — async _
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:507:764` — async EventTarget.continue
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2554` — kre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2422` — nh
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CL6H7ZGC.js:146:2274` — Dre
