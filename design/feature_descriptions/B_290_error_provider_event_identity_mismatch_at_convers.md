---
author: 
id: B_290
internalId: 548342cd-192a-4ca4-9821-cb69c901f1f6
title: Error: Provider event identity mismatch at convers
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 147724761
sentryOrganization: elastetic
after: fd6d10db-4ff5-4099-86a6-e9d3c263e11f
---

## Sentry issue

**Title:** Error: Provider event identity mismatch at conversation entry index 57

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/147724761/)

**First seen:** 2026-09-17T17:01:51Z

**Last seen:** 2026-09-17T17:01:51Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Cre(assets/index-BEXaJcv8)

**Event ID:** da6fa048db90423abdc7290940d94b87

### Application stack frames

- `/assets/index-BEXaJcv8.js:25:6718` — WebSocket.r
- `/assets/index-BEXaJcv8.js:109:42694` — WebSocket.<anonymous>
- `/assets/index-BEXaJcv8.js:109:43673` — Mm.handleMessage
- `/assets/index-BEXaJcv8.js:109:44056` — Mm.handleEvent
- `/assets/index-BEXaJcv8.js:109:44704` — Mm.handleActionRunEvent
- `/assets/index-BEXaJcv8.js:110:12138` — unknown function
- `/assets/index-BEXaJcv8.js:110:18225` — EventTarget.handleIncomingEvent
- `/assets/index-BEXaJcv8.js:110:20546` — EventTarget.handleEvent
- `/assets/index-BEXaJcv8.js:110:7195` — Cre