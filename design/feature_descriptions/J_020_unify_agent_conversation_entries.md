---
author:
id: J-020
internalId: 4edefccb-f7e3-4ae1-9c0d-5939ac1d3745
title: unify agent conversation messages and events into ordered entries
status: ready
owner:
affects:
  - shared/agent_conversations.mjs
  - desktop/src/actions/agent/agent_conversation.js
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_transcript.js
  - app/src/data/data_types.ts
  - app/src/data/action_run_types.ts
  - app/src/services/actions/action_execution_service.ts
  - app/src/services/agents/card_agent_state.ts
  - app/src/components/actions/use_action_popup_controller.ts
  - app/src/components/actions/action_conversation_chat.tsx
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Replace the parallel agent-conversation `messages` and `events` arrays with one canonical ordered `entries` array. Array position is ingestion order and is the only display order.

This refactor must land before the action-popup rendering-isolation work. That work must consume the single entry list and must not preserve the current merge-and-sort path.

## Terminology

- **Conversation entry**: one ordered item in an agent conversation.
- **Message entry**: user or assistant text.
- **Event entry**: reasoning, tool use, command execution, diagnostics, failures, and lifecycle observations.

Do not use **activity** for a conversation entry, field, helper, component, or collection. `activity` remains valid only for the separate card/project activity-storage domain.

## Current architecture

Persisted `AgentConversation` stores `messages` and `events` separately. Live execution repeats the split as `LiveAgentTurn.messages` and `LiveAgentTurn.activities`. Producers append or replace items in those separate collections, while chat and transcript consumers merge and sort them by `sequence` to reconstruct ingestion order.

The split causes:

- duplicate persisted and live representations;
- inconsistent `event`/`activity` terminology;
- repeated merge and sort work in consumers;
- a rebuilt full `AgentConversation` projection in the popup controller;
- ordering behavior owned by presentation code instead of the producer.

## Required model

Use a discriminated union and one collection:

```ts
export interface AgentConversationMessageEntry extends AgentConversationMessage {
    kind: 'message'
}

export interface AgentConversationEventEntry extends AgentConversationEvent {
    kind: 'event'
}

export type AgentConversationEntry = AgentConversationMessageEntry | AgentConversationEventEntry

export interface AgentConversation {
    entries: AgentConversationEntry[]
}
```

Remove `AgentConversation.messages`, `AgentConversation.events`, `LiveAgentTurn.messages`, and `LiveAgentTurn.activities`. The live turn stores the same ordered entry type as the persisted conversation.

The exact interface composition may change during implementation if flattening conflicts with an existing field, but `entry.kind` and the single ordered `entries` collection are required.

## Ordering and updates

- Append a new entry exactly when it is first ingested.
- Streaming chunks update their existing message entry by message ID without moving it.
- Provider event updates replace their existing event entry by provider item ID without moving it.
- User answers and follow-up messages append message entries.
- Diagnostics and lifecycle observations append event entries.
- Continuation copies the existing entries and appends new entries.
- Consumers render or traverse array order directly. They must not merge collections or sort entries by sequence or timestamp.
- An optional provider or protocol sequence may remain as metadata where another boundary requires it, but it must not determine conversation display order.

## Persistence and compatibility

Persist conversations with `entries` only. This is an intentional format break:

- do not read legacy `messages`/`events` arrays;
- do not write both formats;
- do not add a compatibility flag, fallback parser, or migration branch;
- malformed or missing required `entries` must fail with a clear conversation-format error.

Existing persisted conversation files using the old shape are unsupported after this refactor.

## Required code changes

- Change the shared parser and canonical app types to require and validate ordered entries.
- Change desktop conversation creation, continuation, streaming updates, provider-event upserts, checkpoint persistence, and terminal persistence to own the single list.
- Change action execution events and live execution state to use `event` terminology instead of `activity` for conversation data.
- Change transcript generation and cursor handling to filter/slice the ordered list without reconstructing order.
- Change card waiting-state detection to inspect event entries.
- Remove `liveAgentConversation`'s message/event merge. The popup path must receive or select a conversation already containing the canonical entries.
- Change the conversation chat to render `conversation.entries` directly, applying only visibility filters. Remove `ConversationFeedEntry`, `buildConversationFeed`, and its sort comparator.
- Rename conversation-specific `*Activity` components, props, helpers, and files to `*Event` equivalents. Do not rename the separate card/project activity domain.
- Update all fixtures and tests that construct `AgentConversation` or `LiveAgentTurn` values.

## Edge cases

- Repeated chunks for one assistant message retain the entry's original position.
- Repeated updates for one provider event retain the entry's original position and identity.
- Missing IDs fail at the parser or event boundary; they do not create unstable render keys.
- Completed reasoning events may still be hidden by chat presentation rules, but filtering cannot reorder remaining entries.
- Non-Codex conversations preserve their existing event-visibility policy.
- Continuation must not duplicate entries already present in the source conversation.
- Transcript cursors use the located message entry and subsequent array positions, including interleaved event entries.

## Testing implications

- Parser tests cover the new union, required `entries`, malformed kinds, and rejection of the legacy shape.
- Desktop runner tests prove append order and in-place message/event updates.
- Persistence tests prove only `entries` is written.
- Transcript tests prove cursor slicing and filtering preserve array order without sorting.
- Execution-service tests prove live turns expose one ordered list and preserve stable entry positions.
- Chat tests prove direct array-order rendering, visibility filtering, and stable keys.
- Card agent-state tests prove waiting/resumed detection through event entries.
- Update shared conversation fixtures across app and desktop tests; do not retain legacy-shape fixture helpers.

## Acceptance criteria

- [ ] Persisted and runtime agent conversations expose one `entries` array and no parallel message/event collections.
- [ ] Conversation code contains no `activities` collection or conversation-specific `activity` terminology.
- [ ] New entries appear in ingestion order, and updates never move an existing entry.
- [ ] Chat and transcript consumers do not merge or sort conversation entries.
- [ ] The popup controller does not rebuild a conversation by combining live messages with live activities or historical arrays.
- [ ] Persisted output contains `entries` only, and legacy persisted shapes fail clearly.
- [ ] All affected app, desktop, and shared parser tests pass.
- [ ] `npm run lint-fix`, `npm run lint`, and `npm run test` pass in each affected subproject.
