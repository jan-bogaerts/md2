---
author:
id: F_141
internalId: 299444fe-cb8b-420f-a89d-3c3300bf249e
title: remove duplicate agent history payload
status: new
owner:
affects:
  - shared/card_activity.mjs
  - shared/card_activity.d.mts
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run_history.js
  - desktop/src/actions/action/action_files.js
  - app/src/data/electron_action_bridge.ts
  - app/src/components/actions/action_run_history.tsx
agents:
policy:
after: 7b158d24-318d-4081-934b-b9255a0672dc
---

## Problem

Each card has one activity JSON containing canonical conversations and completed root-action records. For agent actions, `records[].history.prompt` duplicates the user message and `records[].history.output` duplicates assistant output already stored in `conversations[].entries`.

This makes the schema unclear and increases already large activity files. The record should describe an execution and link to its conversation; it should not contain a second transcript.

## Current state

- `conversations[]` owns the complete ordered agent transcript, provider events, tool output, status, timing, and usage.
- `records[]` owns one summary per completed root execution, including aggregate commits and all conversation ids produced by its action chain.
- Agent and command executions share one required `history` shape containing `prompt` and `output`.
- `loadActionRunHistory` reads only `records[]`, so the agent history row depends on the duplicated strings.
- `conversationIds[]` includes conversations from root and child actions but does not identify which conversation belongs to the root action.

## Requested changes

1. Make action activity records explicitly distinguish an agent root action from a command root action.
2. For an agent root record:
   - persist a required `rootConversationId` referring to a conversation in the same activity file;
   - retain execution metadata that is not owned by the conversation, such as root status, model/security configuration, timing, and commits;
   - do not persist prompt, assistant output, transcript fragments, or tool output on the record.
3. Keep `conversationIds[]` when it is needed to associate all root and child agent conversations with one execution. Do not use its ordering to infer the root conversation.
4. For a command root record, retain command and output data because no conversation owns it.
5. Replace the shared agent/command `history` payload with discriminated record details. Do not add optional fields whose meaning changes by convention.
6. Update `loadActionRunHistory` and its bridge types so:
   - command history continues to expose command output;
   - agent history exposes execution metadata and the root conversation reference without reconstructing or copying transcript text;
   - commit history and card diff behavior remain unchanged.
7. Update the agent run-history UI to show agent status, configuration, time, and commits. The conversation UI remains the only transcript renderer.
8. Remove `createAgentHistoryEntry` once no call site needs a duplicate agent payload. Keep command-history construction single-purpose.

## Persistence and migration

Introduce one new canonical activity schema version. Provide an explicit one-time migration from the current schema:

- Match an agent record to its root conversation by the record's `conversationIds`, `rootActionId`, and the conversation's `actionId`.
- Fail clearly when the root conversation is missing or ambiguous; do not guess from array order.
- Remove duplicated agent prompt/output only after the canonical conversation has been validated.
- Preserve command history, commits, statuses, timestamps, origins, and child conversation associations exactly.
- Do not retain an indefinite dual-schema parser or write both representations.

Coordinate this migration with conversation `viewed` persistence so the activity schema is migrated once if both jobs are implemented together.

## Edge cases

- A command root action invokes one or more child agent actions: command history remains on the record and `conversationIds[]` retains the child conversations; `rootConversationId` is not present.
- An agent root action invokes child agents: `rootConversationId` identifies only the root conversation while `conversationIds[]` retains every associated conversation.
- A failed or cancelled agent produces no assistant message: the record still preserves execution status and non-transcript failure metadata; no empty duplicate output is introduced.
- A continued conversation contains several turns: the record links to the canonical conversation and does not copy the latest turn into history.
- Scheduled and project-scoped actions follow the same model in `project.json`.
- Commit visibility, ordering, labels, and diff loading must not change.

## Acceptance criteria

- Newly written agent activity records contain no prompt or output strings duplicated from their conversation.
- Every agent root record has an unambiguous `rootConversationId` resolving within the same activity file.
- Command records retain their command and output history.
- Agent conversation rendering and continuation still use `conversations[]` as the only transcript source.
- Agent run history and card commit history still show their existing non-transcript metadata and commits.
- Existing activity data is migrated explicitly to the new canonical schema, after which only that schema is accepted and written.
- Tests cover agent and command roots, mixed root/child chains, continuation, failure/cancellation, scheduled/project actions, migration failures, bridge results, history rendering, and unchanged commit/diff behavior.

