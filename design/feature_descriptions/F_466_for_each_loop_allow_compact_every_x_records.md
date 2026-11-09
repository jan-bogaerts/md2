---
author: 
id: F_466
internalId: 333abc51-f716-4c5e-a14e-20a0e966b9cc
title: for-each loop allow compact every x records
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__333abc51-f716-4c5e-a14e-20a0e966b9cc.json
policy:
branch: f_466_for_each_loop_allow_compact_every_x_records
worktree: 1
---

In the config popup of the for-each function (applied to the action), we can already select to 'compact' after every record. but we should add the option to enter how many records should be skipped before compacting

same should work for starting a new conversation.

## Current state

`ActionForEachSetupDialog` offers `Add prompt`, `Compact`, and `New conversation` as end-of-record modes, but it has no interval setting. `ActionForEachConfig` stores the selected mode, failure policy, start index, data path, file name, and JSON value. `validateForEachConfig` validates that shape for both action-run requests and persisted `AgentConversation` records.

`ActionRun.executeAgentForEach` processes selected records sequentially. `Compact` compacts after every successful record except the final record. `New conversation` starts every record after the first in a separate conversation. Users cannot keep several records in one conversation before either boundary action.

## Implementation details

- Add `recordsPerBatch` to `ActionForEachConfig`. A batch means consecutive records that share one conversation before compaction or conversation replacement. Require a positive safe integer. Normalize missing values to `1`, preserving existing saved configurations and current behavior.
- In `ActionForEachSetupDialog`, show a `Records per batch` number field when mode is `Compact` or `New conversation`. Keep its staged value when users switch modes, validate it before Save, and persist it with the other for-each settings. New JSON attachments default it to `1`.
- Count batches from first record processed by current run after `startIndex`; source records skipped by `startIndex` do not count. With `recordsPerBatch: 3`, records 1–3 use one conversation, then boundary action occurs before record 4.
- For `Compact`, compact after each full batch only when another record remains. Keep current failure behavior: failed boundary record follows configured failure policy and does not trigger compaction.
- For `New conversation`, allocate new `AgentConversation.id` before first record of each later batch. Do not create empty conversation after final record.
- Keep `Add prompt` behavior unchanged; `recordsPerBatch` has no execution effect in that mode.
- Update shared validation tests, setup-dialog tests, prompt-menu configuration tests, run-request tests, persisted-conversation tests, and `ActionRun` tests. Cover interval `1`, larger intervals, partial final batches, `startIndex`, invalid values, compaction failure handling, and both affected modes.

## Acceptance criteria

- User can enter positive whole-number `Records per batch` value for `Compact` and `New conversation`.
- Empty, zero, negative, fractional, non-numeric, or unsafe-integer values cannot be saved or accepted by desktop validation.
- Existing configurations without `recordsPerBatch` behave as value `1`.
- With value `3`, first three processed records share one conversation.
- In `Compact` mode, successful records 3, 6, 9, and so on trigger compaction when another record remains; final record never causes unnecessary compaction.
- In `New conversation` mode, records 4, 7, 10, and so on start new conversation; each batch has distinct canonical `AgentConversation.id`.
- Partial final batch completes without extra compaction or empty conversation.
- Batch counting starts at first record selected by `startIndex`.
- `Add prompt`, failure policy, progress reporting, cancellation, record order, and placeholder resolution retain current behavior.
