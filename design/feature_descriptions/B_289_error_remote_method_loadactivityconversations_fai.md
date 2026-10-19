---
author: 
id: B_289
internalId: fd6d10db-4ff5-4099-86a6-e9d3c263e11f
title: Error: Remote method loadActivityConversations fai
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 147725073
sentryOrganization: elastetic
after: bb36f650-7800-4bbf-aa22-f020d521d43d
---

## Sentry issue

**Title:** Error: Remote method loadActivityConversations failed: Malformed activity file: missing origin

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/147725073/)

**First seen:** 2026-09-17T17:03:46Z

**Last seen:** 2026-09-18T18:00:10Z

**Occurrences:** 8

**Release:** Not provided

**Environment:** production

**Culprit:** Mm.handleResponse(assets/index-BEXaJcv8)

**Event ID:** 5e687ed953ce4d6b82a23ded26327a7f

### Application stack frames

- `/assets/index-BEXaJcv8.js:25:6718` — WebSocket.r
- `/assets/index-BEXaJcv8.js:109:42694` — WebSocket.<anonymous>
- `/assets/index-BEXaJcv8.js:109:43643` — Mm.handleMessage
- `/assets/index-BEXaJcv8.js:109:43785` — Mm.handleResponse
- `/assets/index-BEXaJcv8.js:109:28356` — Sm
- `/assets/index-BEXaJcv8.js:25:6718` — WebSocket.r
- `/assets/index-BEXaJcv8.js:109:42694` — WebSocket.<anonymous>
- `/assets/index-BEXaJcv8.js:109:43643` — Mm.handleMessage
- `/assets/index-BEXaJcv8.js:109:43799` — Mm.handleResponse