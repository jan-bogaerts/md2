---
author: 
id: B_339
internalId: 885c223a-31ec-48c3-8390-f85015ab9c23
title: Error: Missing referenced activity file: C:\Users\
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 155181382
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: Missing referenced activity file: C:\Users\janbo\Documents\dev\md2\design\activity\card__7ce53acc-5a73-4566-931c-96751c9dac9b.json

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/155181382/)

**First seen:** 2026-10-21T12:42:34Z

**Last seen:** 2026-10-22T14:23:48Z

**Occurrences:** 32

**Release:** Not provided

**Environment:** production

**Culprit:** mre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js)

**Event ID:** efbc4786c0f4461f9f732521ee9c49e4

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:503:207734` — async A_e.hydrateActiveCardConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:19162` — async Yse.hydrateActiveCardConversations
- `index 61` — async Promise.all
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:18916` — async Yse.ensureAgentConversationsForCard
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:23283` — async Yse.resolveAndAttachAgentConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13671` — async Jse
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13301` — async Wg
- `index 0` — async Promise.all
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13097` — async Use
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:141:13760` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2554` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2422` — Bm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2274` — mre