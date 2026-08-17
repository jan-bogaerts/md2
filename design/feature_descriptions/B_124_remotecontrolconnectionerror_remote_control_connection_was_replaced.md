---
author: 
id: B_124
internalId: 704af30b-54f1-43ec-b991-39a63e2d52e1
title: RemoteControlConnectionError: Remote-control connection was replaced
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 140874744
sentryOrganization: elastetic
---
# Goal

# Current status

# Details

# Tasks

## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection was replaced

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/140874744/)

**First seen:** 2026-08-15T16:58:37Z

**Last seen:** 2026-08-15T18:43:34Z

**Occurrences:** 4

**Release:** Not provided

**Environment:** production

**Culprit:** Fm.ensureConnected(assets/index-BZ2bioMw)

**Event ID:** 56af29acae524da2ba497a3073d4a319

### Application stack frames

* `/assets/index-BZ2bioMw.js:185:30313` — async EventTarget.reconnect
* `/assets/index-BZ2bioMw.js:185:29241` — EventTarget.connectOnce
* `/assets/index-BZ2bioMw.js:185:26841` — Object.replaceProjectStorage
* `/assets/index-BZ2bioMw.js:182:5699` — e.replaceRemoteStorage
* `/assets/index-BZ2bioMw.js:182:11752` — e.initializeStorageServices
* `/assets/index-BZ2bioMw.js:180:424` — EventTarget.init
* `/assets/index-BZ2bioMw.js:32:32676` — EventTarget.\<anonymous>
* `/assets/index-BZ2bioMw.js:32:36140` — Fm.request
* `/assets/index-BZ2bioMw.js:32:36238` — Fm.sendRequest
* `/assets/index-BZ2bioMw.js:32:36485` — Fm.ensureConnected

note: occurred in electron-react while another web browser was connected through websocket and change occured in web browser that triggered update in electron-react