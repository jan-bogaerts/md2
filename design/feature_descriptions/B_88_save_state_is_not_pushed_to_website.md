---
author: 
id: B_88
internalId: eeb46f0d-77d7-4a9d-a83e-b64e9101b994
title: save state is not pushed to website
status: ready
owner: 
affects:
agents:
  - design/activity/card__eeb46f0d-77d7-4a9d-a83e-b64e9101b994.json#conversation=agent-1761ff54-8fbc-4165-a11d-61ff90293784
  - design/activity/card__eeb46f0d-77d7-4a9d-a83e-b64e9101b994.json#conversation=agent-f6461aaf-f8cb-4b44-bbc9-ca1b36c901d3
policy:
branch: b_88_save_state_is_not_pushed_to_website
worktree: 1
---

the website does appear to update the save-state, but it seems independent of the electron app, so I think the front-end is controlling this which is a problem.

The backend should flush changes and notify the front end that everything has been saved.
if we don't do this, then it becomes possible that there is a conflict when trying to save a file cause ex: the website changed something and the backend also updated the card, marking it dirty in 2 different places. this can give the following error:

External change ignored for design/feature\_descriptions/F\_100\_when\_waiting\_for\_input\_timer\_should\_stop.md because the file has unsaved local edits.&#x20;

## Current state

Refactoring has removed reported split save-state ownership. `ProjectPersistenceService` now owns aggregate renderer save state: dirty open documents, queued or active commit batches, unsaved action drafts, and active storage operations. React reads this state through `useProjectPersistence`; individual components do not decide when project state is saved.

For an Electron save, the renderer starts the storage request and awaits the Electron main process, which is the local storage backend. After the commit succeeds, `CommitBatcher` removes the persisted batch and acknowledges the exact `OpenDocument` edit revision. Service events then change UI state from `dirty` or `saving` to `saved`. Completion of an older revision cannot clear a newer edit. Push state remains separate because a successful local commit is saved even when its later push fails.

Before an Electron agent starts or restarts, `runElectronAction` flushes aggregate pending changes. Later agent file writes return through project watcher events. App-generated watcher echoes are suppressed; a real external write against a still-dirty document produces quoted conflict message and preserves local text. That warning is now intentional conflict protection, not evidence that Electron and React maintain independent save states.

Focused persistence, watcher, action-runner, hook, and status tests pass. No production-code change is currently indicated.

## implementation details

- Keep `ProjectPersistenceService` as sole owner of aggregate `hasPendingSave` and `localSaveState`. It must derive state from open-document revisions, action drafts, commit-batch state, and active storage operations.
- Keep successful storage completion as save acknowledgement. `CommitBatcher` must acknowledge only revision included in successful commit; failed commits and edits made during older commit stay dirty and retryable.
- Keep pre-agent ordering: reserve and link conversation when needed, flush pending renderer changes, then start Electron action. Flush failure must prevent action start.
- Keep watcher roles separate: suppress app commit echoes, apply genuine external changes to clean documents, and reject genuine external changes to dirty documents without overwriting local content.
- Do not add separate Electron `saved` message. Awaited storage response already confirms renderer-initiated persistence; watcher event reports Electron-initiated file changes.

## acceptance criteria

- Editing card or action changes project save indicator to `Dirty`; active storage shows `Saving changes...`; successful commit changes it to `Saved locally` without reload.
- UI never shows saved before storage commit succeeds. Failed commit remains dirty and can be retried.
- Completion of older save does not clear edit made while that save was active.
- Electron action does not start until all pending card and action changes are committed. Flush failure prevents start.
- App-generated watcher echo causes no conflict or reload. External change updates clean document after watcher debounce; same change against dirty document preserves local edit and reports conflict.
- Local save state and remote push state remain independent.
