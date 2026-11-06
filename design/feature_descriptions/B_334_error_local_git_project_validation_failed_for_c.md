---
author: 
id: B_334
internalId: 8e0b5ae2-76a2-4101-86e8-9d19f8736ae0
title: Error: Local Git project validation failed for "C:
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 158497657
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: Local Git project validation failed for "C:\Users\janbo\Documents\marketing\vidsy": Command failed: git rev-parse --is-inside-work-tree

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/158497657/)

**First seen:** 2026-11-04T08:31:15Z

**Last seen:** 2026-11-04T08:31:15Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** vre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js)

**Event ID:** 321c63772dbc4afc99a5c05bc70f5901

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:509:46680` — EventTarget.chooseLocalFolder
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:136:2419` — Im
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-D90FAwtc.js:136:2271` — vre