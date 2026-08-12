---
author: 
id: B_95
internalId: f63b1866-ff7a-4fe9-b984-06cf1284f74e
title: after action name-change actions not correctly refreshed
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f63b1866-ff7a-4fe9-b984-06cf1284f74e.json#conversation=agent-1dd174c3-e12d-4db0-a6d2-54582ef670ef
  - design/activity/card__f63b1866-ff7a-4fe9-b984-06cf1284f74e.json#conversation=agent-c5244368-21af-4955-87be-1e79c1f96e81
policy:
after: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
---

I changed the label of an action, which changed the filename. Now the action had already been used during the run of the application. When a new action-popup was opened, the prompt could not be prepared for the action.

on the ui, the action was using the new label, but it produced an error while trying to prepare the prompt, no prompt was built and the error still referred to the old action file.

## Current state

`ActionService` publishes edited action label immediately and persists label-driven filename change through batched rename. Before popup prepares prompt or starts action, renderer flushes pending save, so renamed file exists on disk and old file no longer exists.

Desktop `ActionDefinitionCache` builds action-path index once when project starts. Action-path index maps stable action ID to current JSON filename. It re-reads selected and linked definitions before each prompt preparation or run, but uses cached paths. After rename, UI therefore shows new label while desktop reads deleted old path and prompt preparation fails.

## implementation details

- Keep stable action ID as execution identity and keep selective per-action disk reads.
- In `ActionDefinitionCache`, rebuild ID-to-path index from current action files when requested non-built-in ID has no indexed path or an indexed file read reports `ENOENT` (file no longer exists). Retry complete definition-graph resolution once with rebuilt index.
- Apply refresh to root and linked actions, so renaming an action used through `onBefore`, `on`, or `onAfter` also resolves current file.
- Publish refreshed index atomically and retain existing project-version guard, so overlapping refresh or project switch cannot install paths from stale project.
- After one retry, report normal unknown-action or validation error. Propagate non-`ENOENT` read failures unchanged; do not hide permission, repository, or malformed-file failures.
- Add cache tests for renamed root and linked action, missing action, one-retry limit, project-switch race, and unchanged selective-read behavior. Add runner regression proving prompt preparation after persisted rename uses current definition and never reads old path again.

## acceptance criteria

- After action label changes its filename and rename is persisted, opening new popup prepares prompt from renamed action without restarting app or reloading project.
- Popup shows new label, prepared prompt uses current definition, and errors do not refer to old filename.
- Starting, reserving conversation for, restarting, or scheduled-running renamed action resolves same current definition because each path uses stable action ID through runner.
- Renamed linked actions resolve correctly through `onBefore`, `on`, and `onAfter` chains.
- Action ID, schedules, histories, conversations, and prompt drafts remain unchanged by filename refresh.
- Truly deleted or invalid action still produces clear current error after single refresh; unrelated disk-read errors remain unchanged.
- Normal resolution still reads only selected definition and its linked definitions; full action-folder rescan occurs only when cached mapping is missing or stale.
