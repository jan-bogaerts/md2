---
author: 
id: B_330
internalId: 3cf170da-d33b-4875-825b-8121f2664e33
title: Error: Cannot save a card without an internal ID: 
status: ready
owner: 
affects:
agents:
  - design/activity/card__3cf170da-d33b-4875-825b-8121f2664e33.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158901482
sentryOrganization: elastetic
after: 65a76f7c-abcf-4ef8-b5cb-81255208dc51
---
## Sentry issue

**Title:** Error: Cannot save a card without an internal ID: design/more details.md

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158901482/)

**First seen:** 2026-11-05T16:20:09Z

**Last seen:** 2026-11-05T16:20:20Z

**Occurrences:** 7

**Release:** Not provided

**Environment:** production

**Culprit:** Ise.saveCardChange(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** b8f020e3388445e8bd8082ad310aa318

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:124265` — r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:122287` — x9
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:9900` — e.flushPendingChanges
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:4148` — rce.updateCardBody
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:150:27178` — Ise.saveCardChange

I think this is already resolved?