---
author: 
id: B_185
internalId: e4529e3e-4f90-4f8b-bd82-2ce3cbba2552
title: Error: Working folder is missing: design/feature_descriptions
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142419007
sentryOrganization: elastetic
after: 8a886351-0de3-4d2e-bcab-9865c8fdeced
---

## Sentry issue

**Title:** Error: Working folder is missing: design/feature_descriptions

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142419007/)

**First seen:** 2026-08-23T19:43:05Z

**Last seen:** 2026-08-23T19:43:05Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** mce.readRootMarkdownFiles(/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js)

**Event ID:** baace206a8b34fa3bef7c68c88e3f065

### Application stack frames

- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:647:41773` — async Object.switchProjectBranch
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:38337` — async EventTarget.switchBranch
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:40923` — async EventTarget.withLoading
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:179:26022` — async xse.openProject
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:15839` — async Hv.loadProjectRoot
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:9272` — async mce.loadProjectRoot
- `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:184:11525` — mce.readRootMarkdownFiles