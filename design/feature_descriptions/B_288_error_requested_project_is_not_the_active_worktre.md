---
author: 
id: B_288
internalId: bb36f650-7800-4bbf-aa22-f020d521d43d
title: Error: Requested project is not the active worktre
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 148904400
sentryOrganization: elastetic
after: 8934cd6c-5449-411d-8382-0ab674d7ea29
---

## Sentry issue

**Title:** Error: Requested project is not the active worktree project

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/148904400/)

**First seen:** 2026-09-23T12:33:22Z

**Last seen:** 2026-09-23T12:33:22Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** hre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js)

**Event ID:** cd1827c28074405793458283ecb36525

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js:128:29521` — async EventTarget.refresh
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js:272:25426` — async G_e.refreshWorktrees
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js:109:28746` — vre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js:109:28614` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DKIABghW.js:109:28465` — hre