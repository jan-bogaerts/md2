---
author: 
id: B_144
internalId: e556141d-344f-4a8d-be37-ed35c9c8ed73
title: RemoteControlConnectionError: Remote-control connection was replaced
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141423776
sentryOrganization: elastetic
after: d5a729dd-61e1-4095-ae4d-c52d2d1595b6
---
## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection was replaced

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141423776/)

**First seen:** 2026-08-18T17:06:44Z

**Last seen:** 2026-08-18T18:29:21Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** nh.ensureConnected(assets/index-CVe3JLtK)

**Event ID:** e47722bb93164b34bc2a3bce63e8d42d

### Application stack frames

* `/assets/index-CVe3JLtK.js:27:12573` — EventTarget.recoverActiveRuns
* `/assets/index-CVe3JLtK.js:27:16866` — EventTarget.handleEvent
* `/assets/index-CVe3JLtK.js:27:17613` — EventTarget.publishScopedEvents
* `/assets/index-CVe3JLtK.js:180:4635` — unknown function
* `/assets/index-CVe3JLtK.js:175:6850` — EventTarget.refresh
* `/assets/index-CVe3JLtK.js:175:8936` — EventTarget.enqueueOperation
* `/assets/index-CVe3JLtK.js:175:6878` — unknown function
* `/assets/index-CVe3JLtK.js:175:7825` — EventTarget.loadOrMigrateSummary
* `/assets/index-CVe3JLtK.js:26:29237` — nh.listRepositoryFiles
* `/assets/index-CVe3JLtK.js:26:36207` — nh.request
* `/assets/index-CVe3JLtK.js:26:36305` — nh.sendRequest
* `/assets/index-CVe3JLtK.js:26:36728` — nh.ensureConnected