---
author: 
id: B_136
internalId: e3c3a79b-0a43-4123-ab48-fe98de8cb2f5
title: Error: Activity conversation not found: agent-fba87b68-1396-4f24-b5da-64eb91594ca5
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 141200068
sentryOrganization: elastetic
after: 8690b93e-98c4-486f-95b6-aacc10931a56
---

## Sentry issue

**Title:** Error: Activity conversation not found: agent-fba87b68-1396-4f24-b5da-64eb91594ca5

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/141200068/)

**First seen:** 2026-08-17T17:17:35Z

**Last seen:** 2026-08-17T17:56:52Z

**Occurrences:** 9

**Release:** Not provided

**Environment:** production

**Culprit:** rh.handleResponse(assets/index-Do4xGfSN)

**Event ID:** e695b536bc1346fd88d73218fea6fb71

### Application stack frames

- `/assets/index-Do4xGfSN.js:25:6714` — WebSocket.r
- `/assets/index-Do4xGfSN.js:26:36945` — WebSocket.<anonymous>
- `/assets/index-Do4xGfSN.js:26:37637` — rh.handleMessage
- `/assets/index-Do4xGfSN.js:26:37782` — rh.handleResponse