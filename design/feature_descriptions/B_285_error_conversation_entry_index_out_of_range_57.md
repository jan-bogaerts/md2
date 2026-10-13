---
author: 
id: B_285
internalId: 32e4933a-720f-410f-847d-6f3e96b6bf31
title: Error: Conversation entry index out of range: 57
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 149451297
sentryOrganization: elastetic
after: 50bf5243-e489-4d76-9524-4933c3c78e36
---

## Sentry issue

**Title:** Error: Conversation entry index out of range: 57

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/149451297/)

**First seen:** 2026-09-25T17:54:14Z

**Last seen:** 2026-09-25T17:54:48Z

**Occurrences:** 15

**Release:** Not provided

**Environment:** production

**Culprit:** zre(assets/index-C6v6RytL)

**Event ID:** 67f75139af5b463f8eb66fa18b73fec3

### Application stack frames

- `/assets/index-C6v6RytL.js:25:6718` — WebSocket.r
- `/assets/index-C6v6RytL.js:120:43491` — WebSocket.<anonymous>
- `/assets/index-C6v6RytL.js:120:44516` — Hm.handleMessage
- `/assets/index-C6v6RytL.js:120:44900` — Hm.handleEvent
- `/assets/index-C6v6RytL.js:120:45636` — Hm.handleActionRunEvent
- `/assets/index-C6v6RytL.js:121:11983` — unknown function
- `/assets/index-C6v6RytL.js:121:18212` — EventTarget.handleIncomingEvent
- `/assets/index-C6v6RytL.js:121:20674` — EventTarget.handleEvent
- `/assets/index-C6v6RytL.js:121:7452` — Bre
- `/assets/index-C6v6RytL.js:121:7376` — zre