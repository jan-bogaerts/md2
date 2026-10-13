---
author: 
id: B_281
internalId: 8b060eac-e294-46f0-86f9-3782d541fa8a
title: Error: This content needs Source mode. The existin
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 152025171
sentryOrganization: elastetic
after: 4c5204ec-c4f1-4dd2-aaae-53c939f48f46
---

## Sentry issue

**Title:** Error: This content needs Source mode. The existing document is preserved; paste or insert it again in Source.

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/152025171/)

**First seen:** 2026-10-07T09:30:15Z

**Last seen:** 2026-10-07T09:30:15Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** gkt.validateRichInsertion(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js)

**Event ID:** d77fb8c9b6c5403fbf4bdf74e44d0fe9

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:25:6718` — HTMLDivElement.r
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:857:11063` — HTMLDivElement.o
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:857:21293` — $R
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:856:7542` — g$e
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:856:11046` — eR
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:856:8720` — $L
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:856:7570` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:2591:2766` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:2591:15737` — Object.insertMarkdown
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CBGwrDFl.js:2591:8918` — gkt.validateRichInsertion