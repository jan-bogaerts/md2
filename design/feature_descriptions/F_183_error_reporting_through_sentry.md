---
author: 
id: F_183
internalId: 715f1a07-796d-4a83-bed9-bd3527584dce
title: error reporting through sentry
status: ready
owner: 
affects:
agents:
  - design/activity/card__715f1a07-796d-4a83-bed9-bd3527584dce.json#conversation=agent-d01ef4eb-dd75-4451-a8ee-53a15089b636
  - design/activity/card__715f1a07-796d-4a83-bed9-bd3527584dce.json#conversation=agent-7d274537-6eb8-41b6-86ad-f83a6f809776
policy:
after: 4bb52e4a-38c7-47bd-9fe8-c49cdd08c0b0
---

## Current state

React telemetry starts before application startup and rendering. In production, configured Sentry receives uncaught window errors and unhandled promise rejections through `telemetryService.captureError`.

`dialogService.error` only converts its argument to display text and dispatches a dialog event. Its 138 production call sites across 64 files therefore show handled errors without reporting them to Sentry. Two call sites, project-load failure and activity-repair persistence failure, separately call both services and already report their errors.

## implementation details

- Make `dialogService.error` call `telemetryService.captureError` once with the original argument before converting that argument to display text. Original argument means exact `Error`, string, or other value supplied by caller, preserving an `Error` stack when available.
- Keep dialog message, fallback message, title, critical state, event dispatch, and return value unchanged. Telemetry failure remains isolated by `TelemetryService`; Sentry failure must not block dialog display.
- Use existing telemetry lifecycle. Sentry reporting remains enabled only after production bootstrap configures a DSN; missing configuration remains a no-op.
- Remove adjacent `telemetryService.captureError(error)` calls from project-load failure and activity-repair persistence failure, because central reporting would otherwise send each error twice.
- All other `dialogService.error` call sites receive central reporting without local changes. All other direct `telemetryService.captureError` calls keep current behavior because they report errors without an error dialog, or accompany warning-only UI. `warning`, `info`, and `success` keep current behavior.
- Extend dialog-service tests with mocked telemetry capture. Verify original error value is captured once and existing dialog output remains unchanged. Keep telemetry service and bootstrap tests unchanged unless test isolation requires reset setup.

## acceptance criteria

- After production telemetry initialization, every `dialogService.error` call sends its original argument to Sentry exactly once.
- `Error` instances reach Sentry unchanged, including their stack; non-`Error` values are also passed unchanged.
- Error dialogs retain current text selection, fallback, title, critical state, event, and return behavior.
- Missing Sentry configuration or a Sentry client failure does not prevent or alter error dialog display.
- Project-load failure and activity-repair persistence failure do not produce duplicate Sentry events.
- Warning, info, success, and direct telemetry-only reporting keep current behavior.
- Unit tests cover Sentry forwarding, single-report behavior, non-`Error` forwarding, and unchanged dialog display.
- App lint and affected unit tests pass.
