---
id: B-024
title: swallowed errors across UI handlers and services
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
Several failure paths vanish without any user-visible signal:
- `DataService.getConfig()` catches all errors and returns `null` — a config-service bug looks like "no project config".
- `ProjectWorkspace.handleSwitchBranchClick` uses `try/finally` with no `catch`; a failed checkout leaves an unhandled rejection and no message.
- `handleCreateCardClick`, `handlePushClick`, `handleMoveCard`, `handleTogglePolicy`, `handleTitleChange`, `handleBodyChange` fire async data-service calls without error handling; commit-batcher failures (e.g. B-001, B-021) surface nowhere.
- `DataService.moveCard` `void`-fires `onState` action runs (also B-009).
- `desktop/diff_service.js` `openInEditor` swallows spawn errors with `child.on('error', () => {})`.
- The commit batcher itself: `flush()` rejections from the timer callback (`void this.flush()`) are unobserved — a failed delayed commit is silent data loss.

## Fix
- Add a single error-reporting path for background persistence: `DataService` catches commit/flush failures, keeps the pending files, and dispatches an `error` event; the workspace shows it in the existing alert (plus telemetry `captureError`).
- Wrap the listed UI handlers with the workspace's `setErrorMessage` pattern already used by `openProject`/`continueAgentConversation`.
- `getConfig()` stops catching; callers handle the not-initialized case explicitly.
- `openInEditor` reports spawn failure back to the renderer (reject the bridge promise) so `DiffView`'s existing error path shows it.

## acceptance criteria
- A failing delayed commit shows a visible error and the edits remain pending (retried on next flush), not silently dropped.
- Branch switch, push, card create/move/toggle failures all surface in the UI.
- No `catch {}` / bare `void promise` remains on persistence-critical paths.
- Tests cover the batcher failure event, a failing branch switch and the openInEditor rejection.

## see also
- `design\feature_descriptions\B_009_running_agents_visibility.md`
- `design\feature_descriptions\B_001_github_commit_stale_sha.md`
