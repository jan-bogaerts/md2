---
author: 
id: B_145
internalId: 4d69acfd-e064-44bf-b04c-81496a09b374
title: Error: Unknown action run: action-6a1f569b-6719-4e44-a509-dcc2061a22c6
status: design
owner: 
affects:
agents:
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

- `/assets/index-CVe3JLtK.js:25:6714` — WebSocket.r
- `/assets/index-CVe3JLtK.js:26:36945` — WebSocket.<anonymous>
- `/assets/index-CVe3JLtK.js:26:37637` — nh.handleMessage
- `/assets/index-CVe3JLtK.js:26:37782` — nh.handleResponse