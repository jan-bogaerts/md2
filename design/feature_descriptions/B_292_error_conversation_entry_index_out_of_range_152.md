---
author: 
id: B_292
internalId: f60d190b-5fa3-454b-8129-70907ef5c2a7
title: Error: Conversation entry index out of range: 152
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 147008203
sentryOrganization: elastetic
after: 985eabb4-1032-49e3-9523-580c67467696
---

## Sentry issue

**Title:** Error: Conversation entry index out of range: 152

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/147008203/)

**First seen:** 2026-09-14T18:07:44Z

**Last seen:** 2026-09-14T18:07:44Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Sre(assets/index-BEXaJcv8)

**Event ID:** 0e4495003f1c44df8ee1013936aa7e96

### Application stack frames

- `/assets/index-BEXaJcv8.js:25:6718` — WebSocket.r
- `/assets/index-BEXaJcv8.js:109:42694` — WebSocket.<anonymous>
- `/assets/index-BEXaJcv8.js:109:43673` — Mm.handleMessage
- `/assets/index-BEXaJcv8.js:109:44056` — Mm.handleEvent
- `/assets/index-BEXaJcv8.js:109:44704` — Mm.handleActionRunEvent
- `/assets/index-BEXaJcv8.js:110:12138` — unknown function
- `/assets/index-BEXaJcv8.js:110:18225` — EventTarget.handleIncomingEvent
- `/assets/index-BEXaJcv8.js:110:20546` — EventTarget.handleEvent
- `/assets/index-BEXaJcv8.js:110:7101` — Cre
- `/assets/index-BEXaJcv8.js:110:7025` — Sre