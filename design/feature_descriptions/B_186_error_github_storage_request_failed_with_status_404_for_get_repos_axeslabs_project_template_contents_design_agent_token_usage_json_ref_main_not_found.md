---
author: 
id: B_186
internalId: db6515b1-0083-414e-ac30-875f4a4c758d
title: Error: GitHub storage request failed with status 404 for GET /repos/AxesLabs/project-template/contents/design/agent_token_usage.json?ref=main: Not Found
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142418974
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: GitHub storage request failed with status 404 for GET /repos/AxesLabs/project-template/contents/design/agent_token_usage.json?ref=main: Not Found

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142418974/)

**First seen:** 2026-08-23T19:42:36Z

**Last seen:** 2026-08-23T19:42:36Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** wt.assertSuccessfulResponse(/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js)

**Event ID:** ec431f00642346f6a2f6d0aa3a6f15b1

### Application stack frames

- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:185:5077` — async EventTarget.runStartup
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:36229` — async EventTarget.restoreLastProject
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:33653` — async ny
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:179:25935` — async xse.openProject
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:175:6737` — async EventTarget.load
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:175:8974` — async EventTarget.enqueueOperation
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:175:7901` — async EventTarget.loadOrMigrateSummary
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:175:8164` — async EventTarget.loadStoredSummary
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:4929` — async uce.readFile
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:11:37364` — async wt.requestJson
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:11:37928` — wt.assertSuccessfulResponse