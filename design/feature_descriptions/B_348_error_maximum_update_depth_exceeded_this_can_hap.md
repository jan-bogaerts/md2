---
author: 
id: B_348
internalId: 22edc81f-6888-44c5-8d8b-48207057c653
title: Error: Maximum update depth exceeded. This can hap
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 159129008
sentryOrganization: elastetic
---

## Sentry issue

**Title:** Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/159129008/)

**First seen:** 2026-11-06T13:42:27Z

**Last seen:** 2026-11-06T13:42:27Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Vr(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js)

**Event ID:** e2a20d3150714c59a14b5828769c2e96

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:9434` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:20067` — EventTarget.handleIncomingEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:26389` — EventTarget.handleEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:149:1284` — Sie.update
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:93011` — handleRunChange
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:94073` — ZHe.updateFromSources
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:97256` — ZHe.applyConversation
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:734:98012` — ZHe.publishViewChanges
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:25:6718` — ZHe.r
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:52219` — ZHe.<anonymous>
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:52338` — Do
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:27090` — zr
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CdBbpY3i.js:10:27517` — Vr