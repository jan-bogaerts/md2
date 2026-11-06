---
author: 
id: B_331
internalId: cf2c723d-9757-4eca-b718-2f5508f1b4ee
title: Error: Cannot save a card without an internal ID: 
status: design
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158900983
sentryOrganization: elastetic
after: ac32ed09-2e05-4ae3-9a90-8a03bba61616
---
## Sentry issue

**Title:** Error: Cannot save a card without an internal ID: design/more details.md

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158900983/)

**First seen:** 2026-11-05T16:18:13Z

**Last seen:** 2026-11-05T16:20:14Z

**Occurrences:** 15

**Release:** Not provided

**Environment:** production

**Culprit:** Ise.saveCardChange(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** b02c1271dc4f408cb98312a11696fb2e

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — HTMLDivElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28333` — yf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28511` — xf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:127805` — Yu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:15085` — Qt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:131579` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:126576` — Uu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:559:27911` — o
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2633:19032` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:41435` — EventTarget.commit
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:43753` — EventTarget.withLoading
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:519:41470` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:9900` — e.flushPendingChanges
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:4148` — rce.updateCardBody
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:150:27178` — Ise.saveCardChange



# More details

This bug occurred while I was editing a generic markdown file in `list view`. So the markdown file did not (and should not) have a header section with an `internal id`.&#x20;

possible solutions here: we could generate a temporary id, that is only valid while 'in memory? we just need to make certain that we don't save a header in these generic markdown files.

or we could use the path. only problem here, what if the filename changes.