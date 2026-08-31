---
author: 
id: B_181
internalId: 7dee6bc2-2c20-4336-99c8-2775f985089e
title: Error: Primary worktree cannot be added as a linked worktree
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__7dee6bc2-2c20-4336-99c8-2775f985089e.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 142420637
sentryOrganization: elastetic
after: 4f01cff9-f2ba-40da-a98f-e72d31e60431
changedFiles:
  - app/src/components/config/worktree_config_list.test.tsx
  - app/src/components/config/worktree_config_list.tsx
  - app/src/services/project/worktree_errors.ts
  - app/src/services/project/worktree_service.node.test.ts
  - app/src/services/project/worktree_service.ts
---
## Sentry issue

**Title:** Error: Primary worktree cannot be added as a linked worktree

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/142420637/)

**First seen:** 2026-08-23T19:59:45Z

**Last seen:** 2026-08-23T19:59:45Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** EventTarget.selectDraftAddition(/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js)

**Event ID:** 90bf74d3435849398c2ff4c011383350

### Application stack frames

* `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:631:65516` — async o
* `/C:/Users/tvorstenburg/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DBkJOzlp.js:45:29208` — EventTarget.selectDraftAddition

This is an error triggered by a real user. I think he was trying to add the main project folder as a worktree in the config dialog.

we can perhaps show a user friendly message when we see that the user is entering the same folder as the currently open repository folder.
