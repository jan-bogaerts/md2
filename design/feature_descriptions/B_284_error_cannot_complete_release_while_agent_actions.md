---
author: 
id: B_284
internalId: 50bf5243-e489-4d76-9524-4933c3c78e36
title: Error: Cannot complete release while agent actions
status: ready
owner: 
affects:
agents:
  - design/activity/card__50bf5243-e489-4d76-9524-4933c3c78e36.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 150104551
sentryOrganization: elastetic
after: 22b04d7f-1a70-41f6-98e8-0236c56b6873
changedFiles:
  - app/src/services/release_blocked_by_running_actions_error.ts
  - app/src/services/release_operations.ts
---
## Sentry issue

**Title:** Error: Cannot complete release while agent actions are running: build

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/150104551/)

**First seen:** 2026-09-29T08:06:37Z

**Last seen:** 2026-09-29T08:06:37Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Vge(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js)

**Event ID:** 571dc5aa87b3457c92b74f1beb807dd9

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:2394:147570` — async m
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:2394:171833` — async completeRelease
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:292:41353` — async EventTarget.completeRelease
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:292:42925` — async EventTarget.withLoading
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:287:1912` — async qge.completeRelease
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B6OQrk8X.js:286:216232` — Vge



This is an expected error. it is a valid error cause the release should not be started. so we should not log this error in sentry.