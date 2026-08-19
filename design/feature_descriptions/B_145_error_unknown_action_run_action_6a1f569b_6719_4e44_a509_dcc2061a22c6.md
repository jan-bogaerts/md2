---
author: 
id: B_145
internalId: 4d69acfd-e064-44bf-b04c-81496a09b374
title: Error: Unknown action run: action-6a1f569b-6719-4e44-a509-dcc2061a22c6
status: ready
owner: 
affects:
agents:
  - design/activity/card__4d69acfd-e064-44bf-b04c-81496a09b374.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141434007
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: Unknown action run: action-6a1f569b-6719-4e44-a509-dcc2061a22c6

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141434007/)

**First seen:** 2026-08-18T18:13:16Z

**Last seen:** 2026-08-18T18:13:16Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** nh.handleResponse(assets/index-CVe3JLtK)

**Event ID:** 0b7de59089ec4e438ac7022941bab18f

### Application stack frames

* `/assets/index-CVe3JLtK.js:25:6714` — WebSocket.r
* `/assets/index-CVe3JLtK.js:26:36945` — WebSocket.\<anonymous>
* `/assets/index-CVe3JLtK.js:26:37637` — nh.handleMessage
* `/assets/index-CVe3JLtK.js:26:37782` — nh.handleResponse

This appears to be a recurring bug. we already tried to fix similar issues recently. details on the setup

* electron app is running and serving websocket
* chrome on android is connected to electron through websocket
* on android, new cards are created, edited, agent run on cards
* some errors appear on android like `remote-control websocket was replaced`  other only appear on the electron renderer like **`Message:`**` External change ignored for design/feature_descriptions/F_211_stats_view_improvements.md because the file has unsaved local edits.` &#x20;

lets analyze the algorithm and find the wrong sequence.&#x20;

## Current state

`ActionRunnerService` owns active runs in Electron. When a run ends, `finalizeRun` removes it from `runs` and `runEvents`, then retains only its terminal result for `wait`.

Android keeps run state in `ActionRunRegistry`. After remote-control WebSocket loss, `RemoteConnectionService` replaces `RemoteControlStorageService`. `ActionRunRegistry` subscribes through the replacement bridge and calls `loadActiveActionRunEvents`, which returns histories for runs still active in Electron.

Wrong sequence:

1. Android receives a running or waiting run.
2. WebSocket closes. Electron continues the run.
3. Run ends before Android recovery loads active runs. Electron removes its active run and event history.
4. Recovery returns no events for that run. `ActionRunRegistry` does not reconcile locally active runs missing from the recovery result, so Android keeps stale interactive state.
5. User sends, finishes, stops, restarts, or answers through stale `runId`.
6. Electron `requireRun` cannot find that completed run and throws `Unknown action run`.

`Remote-control connection was replaced` is expected rejection from retired storage during transport replacement. `External change ignored ... because the file has unsaved local edits` is separate conflict protection: watcher found an external write while renderer still owned an unsaved edit. Neither message should be treated as proof that action itself failed.

## implementation details

- Make reconnect recovery authoritative. An **authoritative recovery snapshot** is Electron state used to decide which renderer runs remain interactive, not only a stream of events to merge.
- Extend action bridge recovery contract so Electron returns active run event histories plus terminal results for renderer run IDs that may have ended during disconnect. Keep terminal recovery results available to every reconnecting client for a bounded lifetime; recovery must not consume result needed by another client.
- In `ActionRunRegistry`, capture locally active run IDs when bridge changes. Subscribe first, then load recovery snapshot. Buffer live events during load, apply snapshot, apply buffered events by sequence, and reconcile every captured ID:
  - keep run when snapshot or buffered events show it active;
  - apply returned terminal result, resolve local waiter, clear approvals/questions/drafts, and release run when Electron reports completion;
  - end local interactivity with explicit `Action run state was lost during reconnection` failure when Electron reports neither active nor terminal state.
- Do not map `Unknown action run` to success and do not make send, answer, finish, restart, or cancel broadly idempotent. Those operations must still reject genuinely invalid run IDs.
- Preserve current run-event sequence deduplication. A terminal event received live during recovery wins over older snapshot events.
- Include remote method name in rejected request context, while preserving Electron error as cause, so future telemetry identifies whether stale operation was send, finish, stop, restart, approval, or question.
- Keep project watcher conflict handling unchanged. This fix repairs action-run recovery only; it must not overwrite dirty editor content or suppress genuine external-change warnings.
- Add focused tests in action runner, action bridge/dispatch, remote-control storage, remote connection, and action-run registry. Cover disconnect before terminal event, completion during snapshot loading, live/snapshot ordering, multiple reconnecting clients, missing recovery state, and real unknown IDs.

## acceptance criteria

- When WebSocket closes while action is running or waiting, Android reconnects and shows current Electron state without duplicate events.
- When action completes, fails, or is cancelled during disconnect, reconnect applies actual terminal result and removes all interactive controls for old `runId`.
- User action after recovery never sends send, finish, stop, restart, approval, or question request for run that Electron reported terminal or lost.
- Completion racing with recovery snapshot resolves once; terminal state cannot revert to running or waiting.
- Two clients reconnecting after same terminal run can both recover its result; one client does not consume recovery state needed by other.
- Genuine invalid run IDs still fail. Telemetry names attempted remote method and retains `Unknown action run` as underlying Electron error.
- Reconnect does not suppress watcher conflicts and never replaces unsaved renderer edits with external file content.
- Focused desktop and app tests, app typecheck, and linters pass.
