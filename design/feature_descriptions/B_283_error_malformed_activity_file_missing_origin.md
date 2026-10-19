---
author: 
id: B_283
internalId: f5a67476-64e5-43f8-b33e-57e25f999e6b
title: Error: Malformed activity file: missing origin
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 146880100
sentryOrganization: elastetic
after: d78bbdec-cace-478a-8639-cc4afa66c7b6
---

## Sentry issue

**Title:** Error: Malformed activity file: missing origin

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/146880100/)

**First seen:** 2026-09-14T08:40:15Z

**Last seen:** 2026-10-02T11:25:06Z

**Occurrences:** 52

**Release:** Not provided

**Environment:** production

**Culprit:** hre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js)

**Event ID:** 93ef1dadc08748b5b6c732fc7d48d394

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:507:37678` — async hLe.load
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:18682` — async Qse.ensureAgentConversationsForCard
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:22947` — async Qse.resolveAndAttachAgentConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:13436` — async Zse
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:12480` — async Lg
- `index 0` — async Promise.all
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:12276` — async Hse
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:139:13525` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:120:29376` — _re
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:120:29244` — Im
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-lIBBsslX.js:120:29096` — hre