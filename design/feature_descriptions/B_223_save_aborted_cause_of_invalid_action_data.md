---
author: 
id: B_223
internalId: da891103-b0c2-488f-9454-480c73c061a0
title: save aborted cause of invalid action data
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__da891103-b0c2-488f-9454-480c73c061a0.json
policy:
after: 2775052a-2e84-4466-a320-155c8ec05bac
---
action x has invalid unsaved data. we should not prevent the saving of an action because of this (most likely type diagram)

## Current state

`ActionDraftStore` keeps invalid editor changes in memory and does not queue them for persistence. During a project-wide save, `flushDrafts()` detects an invalid dirty action and throws before awaiting queued saves for valid actions. `ProjectPersistenceService.flushPendingChanges()` then stops before staging card or instruction documents and flushing their file commits. The invalid action remains dirty, but unrelated work cannot complete through that save.

## Implementation details

* In `ActionDraftStore.flushDrafts()`, commit staged action edits and await queued saves for valid actions before reporting invalid or deleted drafts. Keep each invalid definition out of persistence and retain its editor draft and validation error.
* In `ProjectPersistenceService.flushPendingChanges()`, continue staging and flushing unrelated card, instruction, and file changes when an action draft remains invalid. After those writes finish, report the unresolved action draft as a save blocker; keep the project save state dirty. Do not treat an incomplete project-wide save as success.
* Preserve the existing guard on project or branch changes and desktop close while an invalid draft remains unsaved. Correcting or discarding that draft must allow a later flush to complete. Keep real action write failures visible and retryable.

## Acceptance criteria

* With action X invalid and action Y valid and dirty, saving persists Y, leaves X's invalid changes in its editor without writing them, and reports X as still unsaved.
* In the same state, unrelated dirty card and instruction files reach persistence. Project save remains dirty and reports incomplete until X is corrected or discarded.
* A project or branch change and desktop close still reject an incomplete save, so X's unsaved changes are not lost.
* Tests cover mixed valid and invalid action drafts, unrelated file commits, and successful retry after X becomes valid. Run affected tests and app lint.
