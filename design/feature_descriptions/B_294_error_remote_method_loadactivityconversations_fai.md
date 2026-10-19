---
author: 
id: B_294
internalId: 9ca3ca6c-6799-4e6e-b30b-95e48f9b027f
title: Error: Remote method loadActivityConversations fai
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 146780807
sentryOrganization: elastetic
after: ba4407bb-53a6-4c10-ae76-32bf0f54ab9f
---

## Sentry issue

**Title:** Error: Remote method loadActivityConversations failed: Malformed activity file: missing origin

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/146780807/)

**First seen:** 2026-09-13T17:46:38Z

**Last seen:** 2026-09-13T18:03:54Z

**Occurrences:** 4

**Release:** Not provided

**Environment:** production

**Culprit:** Em.handleResponse(assets/index-nhP_JiBP)

**Event ID:** 4779f8dbdf6f4850b3dd4232e5423f9f

### Application stack frames

- `/assets/index-nhP_JiBP.js:25:6716` — WebSocket.r
- `/assets/index-nhP_JiBP.js:109:42140` — WebSocket.<anonymous>
- `/assets/index-nhP_JiBP.js:109:43089` — Em.handleMessage
- `/assets/index-nhP_JiBP.js:109:43231` — Em.handleResponse
- `/assets/index-nhP_JiBP.js:109:27881` — Qne
- `/assets/index-nhP_JiBP.js:25:6716` — WebSocket.r
- `/assets/index-nhP_JiBP.js:109:42140` — WebSocket.<anonymous>
- `/assets/index-nhP_JiBP.js:109:43089` — Em.handleMessage
- `/assets/index-nhP_JiBP.js:109:43246` — Em.handleResponse