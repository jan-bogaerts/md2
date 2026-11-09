---
author: 
id: B_357
internalId: fa93f8c1-9c05-4067-8f3f-5fb73f0c004e
title: Error: Agent conversation loading has not started 
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 152011115
sentryOrganization: elastetic
after: 564be718-ea86-4c85-b849-005995e92a44
---

## Sentry issue

**Title:** Error: Agent conversation loading has not started for the current project

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/152011115/)

**First seen:** 2026-10-12T11:03:15Z

**Last seen:** 2026-10-13T08:40:41Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** Hse.requireProjectLoadToken(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js)

**Event ID:** 9b969ad21f9d4be599f75a3a9abf1cf8

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:2592:30723` — async M2
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:2592:29067` — j2
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:724:47192` — RLe.load
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:724:44070` — ELe
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:505:9017` — e.listAgentConversations
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:141:18745` — Hse.ensureAgentConversationsForCard
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:141:20021` — Hse.requireProjectLoadToken