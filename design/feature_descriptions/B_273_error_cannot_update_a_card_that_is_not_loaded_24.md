---
author: 
id: B_273
internalId: c3b97e96-4d87-4f60-8a7e-facba4ec7165
title: Error: Cannot update a card that is not loaded: 24
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153288059
sentryOrganization: elastetic
after: 421a382c-ec00-4741-a8f7-eab2a949fcfe
---

## Sentry issue

**Title:** Error: Cannot update a card that is not loaded: 2441fd43-1c55-4d7a-b441-ce919753b78e

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153288059/)

**First seen:** 2026-10-13T08:40:41Z

**Last seen:** 2026-10-13T08:40:41Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Rge.requireCardByInternalId(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js)

**Event ID:** 80aa79b9637b460bb58eff880f3785ca

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:139:9331` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:139:19964` — EventTarget.handleIncomingEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:139:26684` — EventTarget.handleEvent
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:139:2314` — oie
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:141:4388` — Dse.addCardChangedFiles
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:505:13364` — Object.requireCardByInternalId
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-CekrtrYH.js:503:217295` — Rge.requireCardByInternalId