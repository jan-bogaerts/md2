---
author: 
id: F_470
internalId: da4aee5d-5816-4fa9-ae35-cdd114954868
title: for-each stopped keeps track of position
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__da4aee5d-5816-4fa9-ae35-cdd114954868.json
policy:
after: 644f4bf0-b21a-42ba-be1e-5b0daaecb1b8
---

When we stop a for-each, we continue to show the progress bar. this is ok, but the position is lost, we should keep this so we can find the last position easier again

## Current state

`ActionRun.executeAgentForEach` publishes `forEachProgress` before the first selected record and after each processed record. Cancellation does not count the interrupted record as processed, so the last published `processedCount` already identifies the next start index.

`ActionRunRegistry` stores this progress while the run is active, but clears it for every terminal status, including `cancelled`. The popup progress indicator reads only this live run value. The conversation persists its for-each configuration, but not its progress, so the position is unavailable after cancellation, run-store release, or reopening the conversation.

## Implementation details

- Add optional `forEachProgress` to the canonical `AgentConversation` and validate `processedCount` and `totalCount` as safe non-negative integers with `processedCount <= totalCount`.
- When a for-each run is cancelled, persist its latest published progress on the active conversation before publishing the terminal run event. The persisted value must remain the count of completed records; the interrupted record is not completed.
- Preserve cancelled for-each progress in `ActionRunRegistry`. Continue clearing transient interaction state and clear progress for successful completion and other terminal outcomes.
- Update `ForEachProgressIndicator` to use live run progress first and the selected persisted conversation progress otherwise. Do not change the run-button behavior, which shows progress only while a run is active.
- Keep progress scoped to its conversation and run. Starting another run must not reuse progress from a previously cancelled run.
- Add focused tests for activity persistence and parsing, cancellation ordering, registry terminal handling, and live-to-historical popup rendering.

## Acceptance criteria

- Stopping a non-empty for-each run leaves the popup progress bar at the last completed-record count.
- A record interrupted by Stop is not counted as processed. The displayed `processedCount` is the zero-based start index to use when resuming with the first unprocessed record.
- The stopped position remains available after closing and reopening the conversation and after reloading the project.
- Progress that starts from a non-zero `startIndex` retains that initial offset after cancellation.
- Completed records and failed records handled by `logAndContinue` count as processed before a later cancellation.
- Successful completion and non-cancellation failure retain their current terminal behavior and do not leave historical for-each progress visible.
- Ordinary actions and empty for-each runs do not show a for-each progress bar.
- Progress from one conversation or run never appears on another conversation or run.
