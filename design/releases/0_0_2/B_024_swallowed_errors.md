---
id: B-024
title: swallowed errors across UI handlers and services
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 42d265e9-cf04-4faf-af22-4e16e57b8aa2
---

## Problem
Several failure paths vanish without any user-visible signal. Status per item re-verified 2026-07-06:
- **Still open**: `DataService.getConfig()` catches all errors and returns `null` — a config-service bug looks like "no project config".
- **Still open**: `ProjectWorkspace`'s `handleMoveCard`, `handleTogglePolicy`, `handleTitleChange`, `handleBodyChange`, `handleAffectsChange`, `handleHeaderFieldChange` fire data-service calls without error handling; the scheduled-commit failures they can cause surface nowhere.
- **Still open**: the commit batcher's timer callback runs `void this.flush()` (`app/src/data/commit_batcher.ts`) — rejections from a failed delayed commit are unobserved: silent data loss.
- **Still open**: `desktop/diff_service.js` `openInEditor` swallows spawn errors with `child.on('error', () => {})` — a missing `code` binary is a silent no-op.
- ~~`handleSwitchBranchClick` try/finally without catch~~ **done** — branch switching moved to `ProjectToolbarMenu` with error reporting.
- ~~`handleCreateCardClick`/`handlePushClick` unhandled~~ **done** — both report through `reportWorkspaceError`/dialog error state.
- ~~`DataService.moveCard` void-fires `onState` runs~~ **done** — `runStateAction` records failures as card agent errors (B-009).

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
