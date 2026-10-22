---
author: 
id: F_443
internalId: d2d5c693-62b3-4e7f-b957-728a5c468cb0
title: scope usage metrics and reset schedules by account
status: design
owner: 
affects:
agents:
policy:
branch: f_443_scope_usage_metrics_and_reset_schedules_by_account
after: ab1ad841-86e6-43fb-a211-9ce1f1eaf246
---

Persist and project usage measurements and account-reset schedules separately for each agent account, using the account-scoped runtime snapshots from F_442.

## Current state

* `UsageMetricsService` writes account-usage and token-usage records to `usage_metrics.csv` without account identity.
* `ProjectUsageMetricsService` derives percentage deltas from baseline keys containing provider, limit, and window only.
* Account-reset triggers contain agent, limit, window, and expected reset time. `ActionSchedulerService` tracker keys and runtime subscriptions are agent-scoped.
* Existing CSV rows and schedule files predate account switching.

## Implementation details

* Add `account_id` to account-usage and token-usage CSV records and to renderer projections. New records always write the resolved account ID that produced the measurement.
* Accept the old CSV header when reading. A row without `account_id` belongs to that provider's initial account. Do not backfill old rows. New files use the expanded header; before the first account-aware append to an old file, extend its header while leaving its existing rows unchanged and continue treating their missing values as the initial account.
* Include account ID in account-usage baseline keys so percentage deltas are never calculated across accounts. Token-usage records use the account captured on the run by F_440.
* Add optional `accountId` to account-reset schedule triggers, draft state, validation, labels, persisted records, tracker observations, and tracker keys.
* A missing schedule account ID means the trigger agent's initial account. Do not rewrite existing schedule files merely because the field is absent.
* Build reset tracker options from account-scoped runtime snapshots. The schedule form selects an agent, then one of that agent's accounts, then a limit/window from the matching snapshot.
* Match reset observations and pending schedules by `(agent, accountId, limitId, windowId)`. A reset from one account must never fire a schedule registered for another account.
* Preserve the resolved account in the scheduled run selection so the eventual action does not follow a later desktop-default change.
* Removed or unavailable explicit accounts leave the schedule visible but invalid/unfireable with a clear account-specific error. Do not fall back to the initial account.
* Update stats/usage views and active-schedule labels where account identity is needed to distinguish otherwise identical rows or triggers.
* Add focused CSV parsing/writing, baseline, projection, schedule parsing, form, tracker, persistence, and scheduler tests.

## Acceptance criteria

* Account and token usage records identify the account that produced them.
* Percentage deltas and summaries never combine measurements from different accounts of the same provider.
* Existing CSV rows and schedules without account identity continue to represent the provider's initial account without data migration.
* Reset schedules select and display an account and fire only from that account's matching runtime observation.
* Changing the desktop default after schedule registration does not change the scheduled run's account.
* An explicit unavailable account blocks the affected schedule clearly and does not affect other accounts or schedules.
* Focused app and desktop tests and lint pass.
