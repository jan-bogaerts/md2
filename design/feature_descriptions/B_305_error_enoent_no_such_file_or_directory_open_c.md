---
author: 
id: B_305
internalId: 844f1b00-159f-43e2-a2d1-2c6cb40ec39b
title: Error: ENOENT: no such file or directory, open 'C:
status: design
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153402939
sentryOrganization: elastetic
---
## Sentry issue

**Title:** Error: ENOENT: no such file or directory, open 'C:\Users\janbo\Documents\dev\md2\design\feature\_descriptions\F\_429\_no\_commit\_batch\_after\_conversation\_view\_changed.md'

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153402939/)

**First seen:** 2026-10-13T15:36:14Z

**Last seen:** 2026-10-15T07:47:54Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** lre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js)

**Event ID:** ded0f6b2395c41708afb08266e49e9d8

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:63602` — async Xre.prepare
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:724:44403` — async OLe
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2548` — dre
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2416` — qm
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz3gyJQK.js:136:2268` — lre



This is happening because of a recent change we did for improving the speed: we no longer blindly commit everything on the commit-batcher when opening an action popup. This causes a problem though when creating new md files. it seems that the commit-batcher both saves and commits the files. This is ok, we don't need to commit when opening an action popup. however, we should flush all local changes to disk, so save files locally, otherwise the desktop can't use the data.