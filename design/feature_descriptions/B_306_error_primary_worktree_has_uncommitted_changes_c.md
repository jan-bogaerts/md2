---
author: 
id: B_306
internalId: c198a211-ff9a-41ec-b20d-5d300cac7035
title: Error: Primary worktree has uncommitted changes; c
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153373637
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: Primary worktree has uncommitted changes; commit or discard them and retry integration: design/actions/.md2-schedules.json, design/activity/card__26179cc3-97a2-4a33-9e4f-a3b7116e217c.json, design/activity/card__2ac96102-aba9-4901-a7f3-fcbd78b6b7fc.json,...

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153373637/)

**First seen:** 2026-10-13T13:41:03Z

**Last seen:** 2026-10-15T07:45:29Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** lre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js)

**Event ID:** 50b5f0ba071b419d9cb4092a289c400a

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:724:89548` — async we
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:10373` — async EventTarget.integrateCardWorktree
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:504:7743` — async Yge.track
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:504:8155` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:509:21914` — async mve.integrateWorktree
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2548` — dre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2416` — qm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2268` — lre