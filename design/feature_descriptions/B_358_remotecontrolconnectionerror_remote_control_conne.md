---
author: 
id: B_358
internalId: f8fd9b04-7bfe-4ab1-8969-e593e4efcf87
title: RemoteControlConnectionError: Remote-control conne
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

**First seen:** 2026-10-12T18:47:01Z

**Last seen:** 2026-10-12T18:47:01Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** yh.handleClose(assets/index-CekrtrYH)

**Event ID:** 1c3807d66a17479ca38882c64acac57f

### Application stack frames

- `/assets/index-CekrtrYH.js:25:6718` — WebSocket.r
- `/assets/index-CekrtrYH.js:136:49905` — WebSocket.<anonymous>
- `/assets/index-CekrtrYH.js:136:58814` — yh.handleClose