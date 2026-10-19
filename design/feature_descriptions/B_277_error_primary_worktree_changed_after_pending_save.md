---
author: 
id: B_277
internalId: bca7c54d-3645-450f-8fd1-ee611d8f5cfa
title: Error: Primary worktree changed after pending save
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153068561
sentryOrganization: elastetic
after: a9e96d6d-6c1a-45fa-aff3-8ca17f1e0470
---

## Sentry issue

**Title:** Error: Primary worktree changed after pending saves were flushed; save changes and retry integration

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153068561/)

**First seen:** 2026-10-12T10:57:14Z

**Last seen:** 2026-10-12T10:57:14Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Rre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js)

**Event ID:** 699df99e80704be18bc7cc465da1809c

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:724:89472` — async we
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:136:9149` — async EventTarget.integrateCardWorktree
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:504:7128` — async Yge.track
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:504:7540` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:509:21915` — async mve.integrateWorktree
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:136:34030` — Bre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:136:33898` — mh
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:136:33750` — Rre