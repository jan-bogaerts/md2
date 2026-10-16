---
author: 
id: B_287
internalId: 8934cd6c-5449-411d-8382-0ab674d7ea29
title: Error: Remote method prepareWorktree failed: Linke
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 144547599
sentryOrganization: elastetic
after: f5a67476-64e5-43f8-b33e-57e25f999e6b
---

## Sentry issue

**Title:** Error: Remote method prepareWorktree failed: Linked worktree has uncommitted changes: C:\Users\janbo\Documents\dev\md2_workers\dev1

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/144547599/)

**First seen:** 2026-09-23T17:16:20Z

**Last seen:** 2026-09-23T17:54:59Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** Bm.handleResponse(assets/index-Bzmp2Zu3)

**Event ID:** 74ede306a1304fa58f5f8ede9ec2885f

### Application stack frames

- `/assets/index-Bzmp2Zu3.js:25:6718` — WebSocket.r
- `/assets/index-Bzmp2Zu3.js:120:43491` — WebSocket.<anonymous>
- `/assets/index-Bzmp2Zu3.js:120:44486` — Bm.handleMessage
- `/assets/index-Bzmp2Zu3.js:120:44628` — Bm.handleResponse
- `/assets/index-Bzmp2Zu3.js:120:28486` — fre
- `/assets/index-Bzmp2Zu3.js:25:6718` — WebSocket.r
- `/assets/index-Bzmp2Zu3.js:120:43491` — WebSocket.<anonymous>
- `/assets/index-Bzmp2Zu3.js:120:44486` — Bm.handleMessage
- `/assets/index-Bzmp2Zu3.js:120:44643` — Bm.handleResponse