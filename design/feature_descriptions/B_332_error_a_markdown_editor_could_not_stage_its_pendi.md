---
author: 
id: B_332
internalId: 3d6ec998-7fae-40b4-a894-4606092f34e0
title: Error: A Markdown editor could not stage its pendi
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 154937926
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: A Markdown editor could not stage its pending changes

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/154937926/)

**First seen:** 2026-10-20T15:30:34Z

**Last seen:** 2026-11-05T16:18:55Z

**Occurrences:** 6

**Release:** Not provided

**Environment:** production

**Culprit:** e.flushPendingChanges(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** 629b19bce1264009a78eebe2c9c85b68

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:25:6718` — r
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:124254` — n
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:2632:122287` — x9
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:151:9694` — e.flushPendingChanges