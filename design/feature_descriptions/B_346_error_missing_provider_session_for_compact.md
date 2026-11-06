---
author: 
id: B_346
internalId: 6c050c79-a3b5-4f21-bd75-e0a82e6bde7d
title: Error: Missing provider session for compact
status: design
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 159105123
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: Missing provider session for compact

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/159105123/)

**First seen:** 2026-11-06T12:09:07Z

**Last seen:** 2026-11-06T12:09:07Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** onClick(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** 0056636d248b4bf4912380cbbc5d52ef

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — HTMLBodyElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28333` — yf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:11:28511` — xf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:127805` — Yu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:15085` — Qt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:131579` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:10:126576` — Uu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:559:27911` — o
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2612:1960` — onClick

This occured after freshly starting the app, just opened the action popup and selected a historical conversation for the action, so no active conversation yet, but it was an existing one.