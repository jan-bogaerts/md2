---
author: 
id: B_158
internalId: c466633a-3cec-405b-8233-a3e85037b7f5
title: RemoteControlConnectionError: Remote-control connection was replaced
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141912396
sentryOrganization: elastetic
after: d5a729dd-61e1-4095-ae4d-c52d2d1595b6
---
## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection was replaced

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141912396/)

**First seen:** 2026-08-20T18:51:19Z

**Last seen:** 2026-08-20T19:07:51Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** Nm.ensureConnected(assets/index-DBkJOzlp)

**Event ID:** d55081058bd941d0b15819539eba0dd9

### Application stack frames

* `/assets/index-DBkJOzlp.js:25:6718` — WebSocket.r
* `/assets/index-DBkJOzlp.js:26:36977` — WebSocket.\<anonymous>
* `/assets/index-DBkJOzlp.js:26:37699` — Nm.handleMessage
* `/assets/index-DBkJOzlp.js:26:37990` — Nm.handleEvent
* `/assets/index-DBkJOzlp.js:26:38554` — Nm.handleActionRunEvent
* `/assets/index-DBkJOzlp.js:27:9996` — unknown function
* `/assets/index-DBkJOzlp.js:27:14857` — EventTarget.handleIncomingEvent
* `/assets/index-DBkJOzlp.js:27:18909` — EventTarget.handleEvent
* `/assets/index-DBkJOzlp.js:27:19656` — EventTarget.publishScopedEvents
* `/assets/index-DBkJOzlp.js:180:4635` — unknown function
* `/assets/index-DBkJOzlp.js:175:6856` — EventTarget.refresh
* `/assets/index-DBkJOzlp.js:175:8942` — EventTarget.enqueueOperation
* `/assets/index-DBkJOzlp.js:175:6884` — unknown function
* `/assets/index-DBkJOzlp.js:175:7831` — EventTarget.loadOrMigrateSummary
* `/assets/index-DBkJOzlp.js:26:29244` — Nm.listRepositoryFiles
* `/assets/index-DBkJOzlp.js:26:36221` — Nm.request
* `/assets/index-DBkJOzlp.js:26:36319` — Nm.sendRequest
* `/assets/index-DBkJOzlp.js:26:36759` — Nm.ensureConnected