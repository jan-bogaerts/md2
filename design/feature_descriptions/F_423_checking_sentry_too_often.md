---
author: 
id: F_423
internalId: e552b2e5-34ae-4093-8270-daebd4467dbc
title: checking sentry too often
status: ready
owner: 
affects:
agents:
  - design/activity/card__e552b2e5-34ae-4093-8270-daebd4467dbc.json
policy:
after: 6de5732e-480f-4ffa-af7b-d4ce6990ba3b
changedFiles:
  - app/src/services/sentry/sentry_import_service.node.test.ts
  - app/src/services/sentry/sentry_import_service.ts
---

we got this error from sentry when trying to manually retrieve the errors:

> Latest import error: Sentry request failed with status 429: You are attempting to use this endpoint too frequently. Limit is 15 requests in 1 seconds.

which is strange cause auto-retrieve is turned off.

what is going on?

## Current state

The 429 is not caused by automatic import. It comes from a single manual import run.

* `Import now` (in `AppMenu` and `SentryConfigSection`) calls `SentryImportService.importNow()`, which runs `runPoll(true)`. Manual runs ignore `automaticImport` by design. `confirmFirstImport()` runs the same path.
* `runPoll` first calls `SentryApiClient.listUnresolvedIssues`. That request pages sequentially (100 issues per page), so it is not the problem.
* `runPoll` then filters out issues that already have a card ("unseen issues") and loads one event per unseen issue with `Promise.all(unseenIssues.map(... loadRecommendedEvent ...))`. All event requests start at the same moment. With more than 15 unseen issues, Sentry's `events/recommended/` endpoint (limit: 15 requests per 1 second) answers some of them with 429.
* One rejected request rejects `Promise.all`, so the whole run fails: no cards are imported, `latestError` shows the 429 message, and the next click sends the same burst again. A large backlog (first import, or many new issues) can therefore never be imported.
* `SentryApiClient.request` already appends `Retry after N seconds.` to the error when Sentry sends `Retry-After`, but nothing waits or retries.
* The desktop bridge (`desktop/src/integrations/sentry_service.js`) only forwards each request; it adds no pacing.

## Implementation details

* `app/src/services/sentry/sentry_import_service.ts`:
  * Replace the `Promise.all` event loading with a sequential `for...of` loop over `unseenIssues`. Each `loadRecommendedEvent` call waits for the previous one to finish.
  * Add `export const SENTRY_EVENT_REQUEST_SPACING_MS = 100`. Before every event request except the first, wait this long. This caps event requests at 10 per second, below Sentry's 15 per second, even when responses are fast. The loop is bounded by `unseenIssues.length`.
  * Add `wait(delayMs: number): Promise<void>` to `SentryImportServiceDependencies`. `DEFAULT_DEPENDENCIES` implements it with `window.setTimeout`. This keeps tests free of real timers.
  * Inside the loop, stop and return `0` when `isCurrentRequest(projectId, startingKey)` is false. Sequential runs take longer (about 10 seconds per 100 issues), so a project or settings change during the run must cancel the remaining requests instead of only discarding results at the end.
  * Keep the existing failure behavior: a failed event request ends the run, sets `latestError`, and imports nothing. With pacing, 429 should no longer occur. No automatic retry on 429.
* No change to `SentryApiClient`, `SentryConnectionService`, the desktop bridge, polling interval, or `automaticImport` handling.
* Tests in `sentry_import_service.node.test.ts`:
  * Add `wait` to `createService()` dependencies as an immediately resolving `vi.fn`.
  * Add: with three unseen issues, the second `loadRecommendedEvent` call starts only after the first resolves, and `wait` is called twice with `SENTRY_EVENT_REQUEST_SPACING_MS`.
  * Add: a project change while event loading is in progress stops further `loadRecommendedEvent` calls and does not call `importSentryIssues`.
  * Existing tests stay unchanged.

## Acceptance criteria

* With automatic import off, a manual import of more than 15 unseen Sentry issues completes without a 429 error and creates one card per unseen issue.
* Event requests for one import run are sent one at a time, at most 10 per second.
* `isPolling` stays true for the whole run, and only one run is in flight at a time (manual and automatic share the same run, as today).
* Switching project or changing Sentry settings during a run stops the remaining event requests and imports nothing for the old run.
* A failing event request still shows the error in `latestError` and imports nothing.
* Automatic import behavior (15 minute interval, start conditions) is unchanged.