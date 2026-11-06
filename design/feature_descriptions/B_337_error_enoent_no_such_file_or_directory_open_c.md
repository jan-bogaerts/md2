---
author: 
id: B_337
internalId: 4a44a852-c5fe-4648-a39c-e1d1da9a506c
title: Error: ENOENT: no such file or directory, open 'C:
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 155925414
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\feature_descriptions\F_451_drop_changes_does_not_work.md'

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/155925414/)

**First seen:** 2026-10-24T16:29:52Z

**Last seen:** 2026-10-24T16:29:52Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** mre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js)

**Event ID:** 1fdeaf7eca9c4d20ba7b4fbe0ef0d833

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:503:210821` — async A_e.classifyExpectedWatchEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:503:212194` — async A_e.observePersistenceOutcome
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2554` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2422` — Bm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2274` — mre