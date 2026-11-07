---
author: 
id: B_291
internalId: 985eabb4-1032-49e3-9523-580c67467696
title: Error: Queued agent prompt is empty
status: design
owner: 
affects:
agents:
  - design/activity/card__985eabb4-1032-49e3-9523-580c67467696.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 145990654
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: Queued agent prompt is empty

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/145990654/)

**First seen:** 2026-09-16T12:11:52Z

**Last seen:** 2026-09-16T12:11:52Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** V2(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js)

**Event ID:** 7f3de1034fef41a0ad455de66decdf70

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:25:6718` — HTMLBodyElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:11:28324` — kf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:11:28503` — Af
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:127780` — Zu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:15085` — Zt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:131553` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:126356` — Gu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2319:18194` — onKeyDownCapture
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2321:9090` — onRunShortcut
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2319:22034` — V2

I think this was part of a scheduling issue: we had a prompt scheduled to be sent (to an existing conversation) once the account usage was reset. the scheduler triggered the action, but did not properly reuse the conversation. this should be at least partially fixed. there might still be a UI problem where a new conversation appears to be triggered, but the desktop seems to use the correct conversation?&#x20;