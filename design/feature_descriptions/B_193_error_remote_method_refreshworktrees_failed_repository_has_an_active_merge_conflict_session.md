---
author: 
id: B_193
internalId: 26ab18b9-d74a-4bde-a3a4-5efe54e3e57d
title: Error: Remote method refreshWorktrees failed: Repository has an active merge conflict session
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142846728
sentryOrganization: elastetic
after: 270e51c5-6c0f-4dea-9eda-8b234ffa0b35
---

## Sentry issue

**Title:** Error: Remote method refreshWorktrees failed: Repository has an active merge conflict session

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142846728/)

**First seen:** 2026-08-25T18:43:19Z

**Last seen:** 2026-08-25T18:43:19Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** th.handleResponse(assets/index-BvRGAM4z)

**Event ID:** bddac14c181141d1bb3b52458183065a

### Application stack frames

- `/assets/index-BvRGAM4z.js:25:6717` — WebSocket.r
- `/assets/index-BvRGAM4z.js:26:37041` — WebSocket.<anonymous>
- `/assets/index-BvRGAM4z.js:26:37776` — th.handleMessage
- `/assets/index-BvRGAM4z.js:26:37918` — th.handleResponse
- `/assets/index-BvRGAM4z.js:25:6717` — WebSocket.r
- `/assets/index-BvRGAM4z.js:26:37041` — WebSocket.<anonymous>
- `/assets/index-BvRGAM4z.js:26:37776` — th.handleMessage
- `/assets/index-BvRGAM4z.js:26:37950` — th.handleResponse