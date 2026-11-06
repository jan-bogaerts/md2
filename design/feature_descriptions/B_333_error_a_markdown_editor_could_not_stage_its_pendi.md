---
author: 
id: B_333
internalId: b19d82f8-c32a-40a4-9312-9e139dd06ce2
title: Error: A Markdown editor could not stage its pendi
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158901083
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: A Markdown editor could not stage its pending changes

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158901083/)

**First seen:** 2026-11-05T16:18:33Z

**Last seen:** 2026-11-05T16:18:37Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** e.flushPendingChanges(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** b5bf179890e14af4876f6b9e66b37c9c

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — r
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:124192` — e
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:122287` — x9
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:9694` — e.flushPendingChanges