---
author: 
id: B_128
internalId: d015f8af-b7fa-47e1-858c-0611bb70501c
title: Error: Activity conversation not found: agent-5cb838e4-4787-45ea-997a-88dacf343e66
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 140879684
sentryOrganization: elastetic
after: e1b0144c-fce3-44cf-b013-9c20dac25683
---
# Goal

# Current status

# Details

# Tasks

## Sentry issue

**Title:** Error: Activity conversation not found: agent-5cb838e4-4787-45ea-997a-88dacf343e66

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/140879684/)

**First seen:** 2026-08-15T17:59:31Z

**Last seen:** 2026-08-15T17:59:31Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Fm.handleResponse(assets/index-BZ2bioMw)

**Event ID:** 82f0556cb15241d7bfc6f0c82f2134a6

### Application stack frames

* `/assets/index-BZ2bioMw.js:25:6714` — WebSocket.r
* `/assets/index-BZ2bioMw.js:32:36703` — WebSocket.\<anonymous>
* `/assets/index-BZ2bioMw.js:32:37395` — Fm.handleMessage
* `/assets/index-BZ2bioMw.js:32:37540` — Fm.handleResponse



note: occurred in electron-react while another web browser was connected through websocket and change occured in web browser that triggered update in electron-react