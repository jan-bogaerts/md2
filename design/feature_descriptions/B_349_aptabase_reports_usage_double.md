---
author: 
id: B_349
internalId: 24eb9c64-9544-4438-9083-eb8458f60732
title: aptabase reports usage double
status: ready
owner: 
affects:
agents:
  - design/activity/card__24eb9c64-9544-4438-9083-eb8458f60732.json
policy:
changedFiles:
  - app/src/services/telemetry/telemetry_service.service.test.ts
  - app/src/services/telemetry/telemetry_service.ts
---

I think we report for both desktop and renderer usage. this is not really needed, preferably, it is the desktop only

## Current state

The desktop app reports to Aptabase from two independent clients that share the same app key. The Electron main process uses `@aptabase/electron/main` in `desktop/src/integrations/telemetry.js` and sends `electron_starting` and `electron_stop`. The React renderer uses `@aptabase/web` in `app/src/services/telemetry/telemetry_service.ts`; `telemetryService.start()` runs from `app/src/main.tsx` in every runtime and sends `react_start`, `react_stop`, and the user-action events with `runtime: 'react_electron'`.

Each client creates its own session ID and its own system properties, so Aptabase counts every desktop launch as two sessions and inflates user and session counts. `@aptabase/electron/main` already registers the privileged `aptabase-ipc` scheme during `initialize`, which `@aptabase/electron/renderer` uses to forward renderer events into the main-process session.

## implementation details

* Add `@aptabase/electron` to `app/package.json` so the renderer can import `trackEvent` from `@aptabase/electron/renderer`.
* In `TelemetryService.start()`, choose the event sender once from the resolved runtime. For `react_electron`, do not call `@aptabase/web` `init` and send events through `@aptabase/electron/renderer` `trackEvent`. For `react_web`, keep the current `@aptabase/web` behavior.
* Keep event names, the `TELEMETRY_EVENTS` validation, the `runtime` property, pending-event tracking, and `flush()` unchanged for both senders.
* In Electron, renderer telemetry follows the main-process Aptabase state: when the desktop has no app key or initialization failed, forwarded events are dropped by the main SDK and must not affect application behavior.
* Leave Sentry setup, `desktop/src/integrations/telemetry.js`, and the desktop events unchanged.
* Update `telemetry_service.service.test.ts`: in the Electron runtime, expect no `@aptabase/web` `init` call and expect events through the mocked renderer `trackEvent`; in the web runtime, keep the existing expectations.

## acceptance criteria

* One desktop launch produces exactly one Aptabase session containing both the `electron_*` events and the renderer events.
* Renderer events sent from the desktop app carry the Electron SDK system properties, such as app version and operating system.
* The web build still initializes `@aptabase/web` and reports its events as before with `runtime: 'react_web'`.
* No Aptabase events are sent from any runtime when `MD2_APTABASE_APP_KEY` is empty.
* Telemetry failures in either runtime never affect application behavior.
