---
author: 
id: B_344
internalId: ccfe3916-896c-4754-b38a-584d9fbfe3dd
title: Error: Sequence schedule-1792151322013-3q929cfh fa
status: new
owner: 
affects:
agents:
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 154083512
sentryOrganization: elastetic
after: a06f0f67-81e6-428d-85bb-d90688e44d4c
---

## Sentry issue

**Title:** Error: Sequence schedule-1792151322013-3q929cfh failed: Sequence checkout has uncommitted changes: C:\Users\janbo\Documents\dev\md2_workers\dev1

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/154083512/)

**First seen:** 2026-10-16T12:09:20Z

**Last seen:** 2026-10-16T12:09:20Z

**Occurrences:** 1

**Release:** desktop@0.8.5

**Environment:** production

**Culprit:** ScheduledCardSequenceEngine.failSequence(desktop.src.actions.schedule:scheduled_card_sequence_engine)

**Event ID:** 968d2afea8304f409d21f31bf62af392

### Application stack frames

- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:210:9` — ScheduledCardSequenceEngine.applyRunResult
- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:224:38` — ScheduledCardSequenceEngine.applyStepResult
- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:291:13` — ScheduledCardSequenceEngine.advanceOrComplete
- `app:///desktop/src/actions/schedule/scheduled_card_sequence_engine.js:323:30` — ScheduledCardSequenceEngine.failSequence