---
author: 
id: B_300
internalId: dc18bd32-58a2-4426-99ce-c79309619b03
title: Error: Sequence schedule-1791896021654-jvp09iga fa
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 153363943
sentryOrganization: elastetic
after: c2391409-5ac7-4a3f-97fa-ac76e3739364
---

## Sentry issue

**Title:** Error: Sequence schedule-1791896021654-jvp09iga failed: Cannot recover sequence action run action-25481df9-0ea9-4533-b1bd-5d3a39642958: Unknown action run: action-25481df9-0ea9-4533-b1bd-5d3a39642958

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/153363943/)

**First seen:** 2026-10-13T13:07:32Z

**Last seen:** 2026-10-13T13:07:32Z

**Occurrences:** 1

**Release:** desktop@0.8.3

**Environment:** production

**Culprit:** ScheduledCardSequenceEngine.failSequence(desktop.src.actions.schedule:scheduled_card_sequence_engine)

**Event ID:** 2e23301de3b740d88485252f87341568

### Application stack frames

- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:206:9` — ScheduledCardSequenceEngine.failUnrecoverableRun
- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:255:30` — ScheduledCardSequenceEngine.failSequence