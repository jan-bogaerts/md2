---
author: 
id: B_141
internalId: e9c39111-06ec-4e90-98ec-3d1d0fb7e400
title: RemoteControlConnectionError: Remote-control connection was replaced
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141200037
sentryOrganization: elastetic
after: d5a729dd-61e1-4095-ae4d-c52d2d1595b6
---
## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection was replaced

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141200037/)

**First seen:** 2026-08-17T17:17:18Z

**Last seen:** 2026-08-17T17:17:18Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** rh.ensureConnected(assets/index-Do4xGfSN)

**Event ID:** 72916aa59511407bae25493c470d58c0

### Application stack frames

* `/assets/index-Do4xGfSN.js:25:6714` — WebSocket.r
* `/assets/index-Do4xGfSN.js:26:36945` — WebSocket.\<anonymous>
* `/assets/index-Do4xGfSN.js:26:37667` — rh.handleMessage
* `/assets/index-Do4xGfSN.js:26:37880` — rh.handleEvent
* `/assets/index-Do4xGfSN.js:26:38444` — rh.handleActionRunEvent
* `/assets/index-Do4xGfSN.js:27:9627` — unknown function
* `/assets/index-Do4xGfSN.js:27:12911` — EventTarget.handleIncomingEvent
* `/assets/index-Do4xGfSN.js:27:16866` — EventTarget.handleEvent
* `/assets/index-Do4xGfSN.js:27:17613` — EventTarget.publishScopedEvents
* `/assets/index-Do4xGfSN.js:176:4635` — unknown function
* `/assets/index-Do4xGfSN.js:175:7093` — EventTarget.refresh
* `/assets/index-Do4xGfSN.js:175:7502` — EventTarget.loadStoredSummary
* `/assets/index-Do4xGfSN.js:26:28900` — rh.loadTextFile
* `/assets/index-Do4xGfSN.js:26:36207` — rh.request
* `/assets/index-Do4xGfSN.js:26:36305` — rh.sendRequest
* `/assets/index-Do4xGfSN.js:26:36728` — rh.ensureConnected