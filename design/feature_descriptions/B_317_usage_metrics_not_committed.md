---
author: 
id: B_317
internalId: 35e2668b-44b4-4be8-9a82-cc3c7f2b4003
title: usage_metrics not committed
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__35e2668b-44b4-4be8-9a82-cc3c7f2b4003.json
policy:
---

we update [usage\_metrics.csv](design/usage_metrics.csv) on a regular basis in the project. but it does not seem to use the [commit\_batcher.ts](app/src/data/commit_batcher.ts) for committing the file?

## Current state

* The desktop `UsageMetricsService` (`desktop/src/actions/agent/usage_metrics_service.js`) appends rows to `<projectFolder>/usage_metrics.csv`:
  * `token_usage` rows after each agent turn (`recordTokenUsage`, called from `agent_runner_service.js` and `agent_streaming_event_handlers.js`).
  * `account_usage` rows whenever the Claude or Codex rate-limit snapshot changes (`recordAccountUsage`). The Claude usage poll repeats every `AGENT_USAGE_POLL_TICK_MS` (2 minutes), so these rows are written even when no agent runs.
* After each append, `appendRecords` only calls `uncommittedProjectWrites.mark(rootPath, [filePath])`. Nothing notifies the renderer and nothing schedules a commit.
* `uncommittedProjectWrites.commit(rootPath)` runs only inside `integrateWorktree` and `continueMergeConflict` in `desktop/src/shell/local_bridge_dispatch.js`. Result: the file stays modified in the primary worktree until the next worktree integration. Projects that do not integrate worktrees never commit it.
* Other desktop-written files already reach Git differently:
  * activity files and the token usage summary are committed directly by the desktop (`commitTrackedPaths` in `project_agent_token_usage.js`);
  * conversation view state is committed through the renderer `CommitBatcher`: `agent_acknowledgement_service.ts` calls `DataService.scheduleRepositoryPathCommit(path, message)`, which queues a `kind: 'path'` change. At flush time, the desktop `commit` in `project_files.js` stages that path as it is on disk and commits it together with the rest of the batch. A path that no longer exists is skipped.
* There is no desktop-to-renderer event for usage metrics writes. Existing desktop-to-renderer subscriptions (for example `onActionConversationViewed`, `onClaudeRateLimits`) use `SUBSCRIPTION_METHODS` in `desktop/main.js`, `subscribeBridge` in `desktop/src/shell/preload.js`, and a handler in `local_bridge_dispatch.js`.

## Implementation details

Goal: every usage metrics append is committed through the shared `CommitBatcher`, using the same `kind: 'path'` mechanism as conversation view state. The batcher's delay (`AUTO_COMMIT_DELAY_MS`) groups frequent appends into one commit.

### Desktop

* `UsageMetricsService` extends `EventTarget`. After a successful `appendFile` in `appendRecords`, it dispatches a `written` event (`USAGE_METRICS_WRITTEN_EVENT`). The `CustomEvent` detail is `{ path }`: the repository-relative path of the CSV with forward slashes (for example `design/usage_metrics.csv`). No event is dispatched when the append fails or when `recordAccountUsage` finds no changed window.
* Keep `uncommittedProjectWrites.mark(...)`. It stays the fallback: if the renderer is not subscribed or scheduling fails, the next integration still commits the file. When the batcher already committed the file, `commitTrackedPaths` finds no staged changes and does nothing.
* `local_bridge_dispatch.js`: add `onUsageMetricsWritten(callback)` to `actionBridge`. It calls `addEventListener` on the injected `usageMetricsService`, forwards `event.detail` to the callback, and returns a cleanup that calls `removeEventListener`. Pass `usageMetricsService` into `createLocalBridgeDispatch` from `desktop/main.js`.
* `desktop/main.js`: add `'onUsageMetricsWritten'` to `SUBSCRIPTION_METHODS`.
* `desktop/src/shell/preload.js`: add `onUsageMetricsWritten: (callback) => subscribeBridge('onUsageMetricsWritten', [], callback)`.
* Remote control is not changed. The desktop window's renderer owns this commit.

### App

* `app/src/data/electron_action_bridge.ts`: add an optional `onUsageMetricsWritten?(callback: (event: UsageMetricsWrittenEvent) => void): () => void` with `UsageMetricsWrittenEvent = { path: string }`.
* `app/src/services/agents/agent_integration.ts`: add a `startUsageMetricsWatch` next to `startConversationViewWatch`, with the same lifecycle (start with the project watch, clean up in `stopScheduledRunWatch`). On each event it calls `dataService.scheduleRepositoryPathCommit(event.path, 'Update usage metrics')`. A scheduling error is reported through `telemetryService.captureError`, like the conversation view watch. It must not be shown as a dialog every 2 minutes.

### Edge cases

* Many appends before the flush: `changeKey` for a path change is `path:<path>`, so they collapse into one pending entry. The flush commits the file content that is on disk at that moment.
* An append that lands after the flush has staged the file: it dispatches a new event, so it is committed in the next batch.
* An event from the previous project that arrives after a project switch: the path is resolved against the new project root. If the file does not exist there, the desktop skips it. If it exists, committing it is correct because it is also an uncommitted usage metrics change of the open project.
* Commit failure: the batcher keeps the path pending (`restoreFailedBatch`) and reports the failure through its existing `flushFailed` event.

### Tests

* `desktop/src/actions/agent/usage_metrics_service.test.mjs`: a `written` event with the relative path after a token append and after a changed account append; no event when nothing changed or when `appendFile` rejects.
* `desktop/src/shell/local_bridge_dispatch.test.mjs`: `onUsageMetricsWritten` forwards the event detail, and the cleanup removes the listener.
* App test next to `agent_integration.ts`: a bridge event schedules `scheduleRepositoryPathCommit` with the event path and `'Update usage metrics'`. Stopping the project watch removes the subscription.

## Acceptance criteria

* After an agent turn or a changed account usage poll, `usage_metrics.csv` is committed by the regular commit batch within the auto-commit delay. No worktree integration is needed.
* Several appends within one batch window produce one commit that contains the latest file content.
* The CSV content and format do not change.
* If the renderer does not schedule the commit, the file is still committed by the next worktree integration, as it is now.
* A failed commit leaves the path pending for the next flush. It does not affect agent runs.
* The new desktop and app tests pass, and lint passes in `app` and `desktop`.