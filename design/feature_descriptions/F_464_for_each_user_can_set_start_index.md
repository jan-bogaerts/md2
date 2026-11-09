---
author: 
id: F_464
internalId: c7fa6216-d134-4237-8f14-c494ac314c01
title: for each - user can set start index
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c7fa6216-d134-4237-8f14-c494ac314c01.json
policy:
---

in the for-each config popup, user should be able to set the index position to start from, default 0.

This should be passed on to the desktop with the rest of the for-each info.

## Current state

`ActionForEachConfig` stores the JSON value, file name, optional data path, end mode, and failure policy. Draft configuration lives in `ActionRunInputStore`; configuration on an existing conversation is persisted in its activity file. Shared validation rejects unknown fields, and the complete configuration reaches the desktop in the action run input.

`ActionForEachSetupDialog` stages the existing settings until Save. It has no start-index field. `ActionRun.executeAgentForEach` resolves the ordered record list and always starts with record index `0`.

## implementation details

- Add `startIndex` to `ActionForEachConfig`. It is a zero-based, non-negative safe integer. Shared configuration validation must reject negative, fractional, unsafe, and non-number values. Treat a missing field as `0` so existing saved configurations retain current behavior, and return the normalized configuration with `startIndex` included.
- Add a numeric `Start index` field to `ActionForEachSetupDialog`. Initialize it from `config.startIndex ?? 0`, stage edits with the other settings, and include the number in the complete configuration saved through the existing draft or conversation path. Use input constraints for a minimum of `0` and whole-number steps, then validate on Save and show invalid input through `dialogService`; do not silently coerce it.
- Resolve `dataPath` before applying `startIndex`. The desktop must execute records from the configured position through the end, in source order. Failure events and other index-based reporting must retain each record's original zero-based index rather than renumbering the remaining records from `0`.
- A `startIndex` equal to or greater than the resolved record count produces an empty loop. Complete successfully without starting an agent turn, matching existing empty-list behavior.
- Extend focused tests for setup defaults, save/cancel, invalid values, draft and persisted-conversation retention, shared and run-request validation, execution from the chosen index, original failure indexes, root arrays, data-path-selected arrays, and indexes at or beyond the record count.

## acceptance criteria

- For-each setup contains a `Start index` numeric field whose default is `0`.
- Start index is zero-based: `0` processes every resolved record, while `2` starts with the third resolved record and then processes all later records in order.
- Saved start index is retained in draft runs and persisted conversations, including after reopening a conversation, and reaches the desktop with the rest of `ActionForEachConfig`.
- Existing configurations without `startIndex` behave as `startIndex: 0`.
- Negative, fractional, unsafe, and non-number start indexes show a clear error and start no agent turn.
- Start index is applied after data-path selection. Failure reporting keeps original record indexes.
- A start index equal to or greater than record count completes successfully without an agent turn.
- Existing View, Remove, running-loop locking, end modes, failure policies, data-path selection, and `{{data path}}` placeholder behavior remain unchanged.
