---
author: 
id: B_275
internalId: ab5d2b6d-6c9e-4fbd-baf7-5d87de17c07c
title: TypeError: Cannot read properties of undefined (re
status: ready
owner: 
affects:
agents:
  - design/activity/card__ab5d2b6d-6c9e-4fbd-baf7-5d87de17c07c.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 151736297
sentryOrganization: elastetic
after: 4677a35c-e7bf-4ef7-86c7-9f02d8604f47
changedFiles:
  - app/src/components/actions/run/popup/action_input_splitter.test.tsx
  - app/src/components/actions/run/popup/action_input_splitter.tsx
---

## Sentry issue

**Title:** TypeError: Cannot read properties of undefined (reading 'pointerStart')

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/151736297/)

**First seen:** 2026-10-06T14:16:05Z

**Last seen:** 2026-10-12T18:41:40Z

**Occurrences:** 4

**Release:** Not provided

**Environment:** production

**Culprit:** finishResize(assets/index-CekrtrYH)

**Event ID:** 749e618727a44e108bf118486ab4b9e3

### Application stack frames

- `/assets/index-CekrtrYH.js:25:6718` — HTMLBodyElement.r
- `/assets/index-CekrtrYH.js:11:28512` — Ef
- `/assets/index-CekrtrYH.js:10:127809` — ed
- `/assets/index-CekrtrYH.js:10:15085` — en
- `/assets/index-CekrtrYH.js:10:131583` — unknown function
- `/assets/index-CekrtrYH.js:10:126580` — Ju
- `/assets/index-CekrtrYH.js:2598:21494` — finishResize