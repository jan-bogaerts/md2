---
author: 
id: B_198
internalId: de0feeef-9303-4619-9023-9d60fbe87dd8
title: RemoteControlConnectionError: Remote-control connection closed
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142844993
sentryOrganization: elastetic
---

## Sentry issue

**Title:** RemoteControlConnectionError: Remote-control connection closed

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142844993/)

**First seen:** 2026-08-25T18:30:09Z

**Last seen:** 2026-08-25T18:30:09Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** th.handleClose(assets/index-BvRGAM4z)

**Event ID:** f67d969a5f7c447bb089ad11c19cc273

### Application stack frames

- `/assets/index-BvRGAM4z.js:25:6717` — WebSocket.r
- `/assets/index-BvRGAM4z.js:26:37105` — WebSocket.<anonymous>
- `/assets/index-BvRGAM4z.js:26:43452` — th.handleClose