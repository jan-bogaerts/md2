---
author:
id: J_38
internalId: 4f01cff9-f2ba-40da-a98f-e72d31e60431
title: replace conversation projection with chatlog tracker
status: ready
owner:
affects:
agents:
  - design/releases/V_0_5_0/card__4f01cff9-f2ba-40da-a98f-e72d31e60431.json
policy:
after: b7b584ed-ea26-43d0-917c-e75337611846
changedFiles:
  - agents.md
  - app/src/components/actions/conversation/action_conversation_chat.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat.tsx
  - app/src/components/actions/conversation/action_conversation_chat_selectors.node.test.ts
  - app/src/components/actions/conversation/action_conversation_chat_selectors.ts
  - app/src/components/actions/conversation/action_conversation_chatlog_tracker.node.test.ts
  - app/src/components/actions/conversation/action_conversation_chatlog_tracker.ts
  - app/src/components/actions/conversation/action_conversation_evolving_groups.tsx
  - app/src/components/actions/conversation/action_conversation_group_list.tsx
  - app/src/components/actions/conversation/action_conversation_history.tsx
  - app/src/components/actions/conversation/action_conversation_queued_prompts.tsx
  - app/src/components/actions/conversation/action_conversation_render_projection.node.test.ts
  - app/src/components/actions/conversation/action_conversation_render_projection.ts
  - app/src/components/actions/conversation/action_conversation_rendering.test.tsx
  - app/src/components/actions/conversation/action_conversation_reservation.node.test.ts
  - app/src/components/actions/conversation/action_conversation_reservation.ts
  - app/src/components/actions/conversation/action_conversation_reserved_blocks.tsx
  - app/src/components/actions/conversation/action_conversation_store.node.test.ts
  - app/src/components/actions/conversation/action_conversation_store.ts
  - app/src/components/actions/conversation/action_conversation_transcript.tsx
  - app/src/components/actions/conversation/completed_tool_call_group.tsx
  - app/src/components/actions/conversation/sub_agent_group.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
---

The conversation chatlog currently mutates a render projection while React renders. That projection treats older entries as sealed and crashes when a valid later update targets one of them. Replace this design with one class instance per mounted chatlog. The instance receives conversation changes, owns the derived chatlog view data, and publishes read-only lists for React to render.

## Current state

`ActionRunRegistry` is the canonical live-run boundary. It receives backend events, applies them to an `ActionRunStore`, and exposes run and action subscriptions. Provider events may update an existing conversation entry by index; an older entry is not guaranteed to remain unchanged.

`ActionConversationStore` owns persisted conversation loading and selection. `ActionRunBindingStore` selects the live run shown by a popup. A continued conversation can therefore move between stopped and active runs while retaining the same conversation identity.

`ActionConversationTranscript` currently creates `ActionConversationRenderProjection` as React state and calls `projection.update(...)` during render. The projection owns grouped history, a mutable tail, expansion state, reservation inputs, and a sealed-entry boundary. A new user entry or inactive run moves the tail into sealed history. Any later update below that boundary throws `Conversation update targets sealed entry index ...`.

This has three problems:

* application state is mutated during React rendering;
* derived projection state can diverge from the canonical conversation;
* an optimization assumption is enforced as a fatal domain invariant.

## Target architecture

Add an `ActionConversationChatlogTracker` class beside the conversation components. Each mounted chatlog owns exactly one tracker instance.

### Lifecycle and inputs

* `ActionConversationTranscript` creates and loads the tracker in an effect.
* `load()` reads the displayed conversation and registers required listeners.
* Live updates come through the existing `ActionRunRegistry`; do not subscribe directly to Electron or add another global backend dispatcher.
* Run rebinding comes through `ActionRunBindingStore`. A new run that continues the same conversation updates the existing tracker instead of creating a second conversation model.
* Persisted selection changes come through the existing `ActionConversationStore` boundary.
* `unload()` removes every listener and releases tracker-owned view state. Effect cleanup always calls it.
* Changing run ID or run status alone must not reset the tracker. Reset displayed view state only when conversation identity changes.

`AgentConversation.id` is canonical conversation identity. `path` identifies its persisted record and remains relevant for selection and continuation. A replacement or recovery snapshot for the same conversation replaces the tracker's latest canonical input and recalculates its derived lists.

### Owned view data

The tracker holds the latest canonical conversation reference; it does not clone conversation entries or become a second canonical transcript. It derives and owns two render-group lists:

* `stableGroups`: entries and groups expected to change infrequently;
* `evolvingGroups`: live entries and groups expected to change regularly.

Stable means low update frequency, not immutable. An update to a stable entry rebuilds the affected stable data and publishes a new `stableGroups` reference. It must never fail because the entry was previously considered stable.

Lifecycle changes may move groups from `evolvingGroups` to `stableGroups`. This movement is event-driven, not timer-driven. Preserve conversation order. If a later event changes grouping, nesting, visibility, or lifecycle state, the tracker updates whichever lists are affected.

The tracker also owns:

* render grouping, including completed tool-call and nested sub-agent groups;
* group expansion state;
* reservation state and reserved-block count;
* provider-event visibility needed by the chatlog.

No sealing, sealed-entry count, or sealed-update guard remains.

### React boundary

The tracker extends or composes `EventTarget`. It publishes scoped changes after updating its internal state. React subscribes with `useSyncExternalStore` at the smallest component that renders each value.

`getSnapshot` methods are read-only and return stable references derived from tracker data. The chatlog component never calls a mutating tracker method during render. It only renders `stableGroups`, `evolvingGroups`, reserved blocks, and queued prompts.

Unchanged lists retain their references. When an entry or group changes, the containing list receives a new reference so React rerenders it. Entry objects continue to come from the canonical conversation.

## Current call sites

* `ActionConversationTranscript`: replace render-time projection and reservation updates with tracker lifecycle and subscriptions.
* `ActionConversationChat`: keep conversation selection and acknowledgement behavior; provide tracker lifecycle inputs instead of a precomputed mutable projection input.
* `ActionConversationGroupList`: render tracker groups without depending on `ActionConversationRenderProjection`.
* `ActionConversationHistory`: render the stable list; remove sealed-history terminology.
* `CompletedToolCallGroup` and `SubAgentGroup`: read expansion state from the tracker.
* `action_conversation_reservation.ts`: move reservation ownership into the tracker. Pure calculations may remain separate if they have no independent state.
* `action_conversation_chat_selectors.ts`: remove transcript projection selection that becomes redundant; keep selectors still required by acknowledgement or other metadata consumers.

All call sites receive the new behavior. Do not add compatibility modes, fallback projection paths, or legacy sealed-state support.

## Edge cases and failure handling

* An indexed update may target either list. Update the entry and rebuild affected groups.
* Appending a user or assistant entry preserves order and updates the evolving list.
* A completed or inactive run may still receive a replacement snapshot. Reconcile it normally.
* Continuing the same conversation in another run preserves displayed conversation, expansion state, and stable groups where their inputs remain unchanged.
* Selecting another conversation resets conversation-specific view state and subscriptions.
* Loading a persisted conversation may initially place all groups in the stable list, but later refreshes remain allowed to update them.
* Recovery and full replacement rebuild from canonical input without relying on previous list boundaries.
* Malformed backend indexes and identity mismatches remain `ActionRunRegistry` contract errors. A tracker cache mismatch is not a backend error and must rebuild instead of crashing the UI.
* Tracker load failures are reported through `dialogService` from an effect; React renders a safe empty or loading state.

## Compatibility and scope

Preserve transcript content, ordering, provider visibility, grouping, expansion, reservations, queued prompts, conversation selection, continuation, Markdown rendering, acknowledgement, and stick-to-end scrolling.

Do not change desktop event formats, conversation persistence, provider event frequency, action execution, usage-summary ownership, or transcript virtualization as part of this job. Indexed entry updates introduced by `J_36` remain valid; only its sealed render-projection design is replaced.

## Tests

Add focused tracker tests covering:

* load and unload register and remove all listeners;
* evolving entry updates publish only a new evolving-list reference;
* stable entry updates succeed and publish a new stable-list reference;
* lifecycle changes move groups between lists without changing order;
* later updates can change a previously moved group;
* full replacement and recovery rebuild both lists;
* continuation through a different run keeps one conversation and tracker instance;
* conversation selection resets conversation-specific state;
* grouping, nested sub-agents, expansion, provider visibility, and reservation counts remain correct.

Update React tests to verify that the transcript subscribes and renders tracker output without mutating tracker state during render. Add a regression test for an update to a stable entry after a terminal-status render; it must update the UI without throwing.

Run directly affected app tests and `npm run lint`. Do not run the full test suite unless separately requested.

## Acceptance criteria

* One `ActionConversationChatlogTracker` instance owns view data for each mounted chatlog.
* Tracker lifecycle starts in an effect and always unregisters listeners on cleanup.
* Tracker follows one conversation across stopped and continued runs.
* Tracker exposes stable and evolving render-group lists with stable references when unchanged.
* Entries may update in either list; no list is treated as immutable.
* Grouping, expansion, reservations, visibility, and movement between lists are tracker responsibilities.
* React only subscribes and renders. No application state is created or mutated during render.
* `ActionConversationRenderProjection`, sealing logic, and sealed-update failures are removed.
* No conversation entries are cloned into another canonical model.
* Existing chatlog behavior remains unchanged except that valid updates cannot crash because an entry was considered stable.
* Focused tracker, component, and regression tests pass, and app lint passes.

## See also

* `design/feature_descriptions/J_36_investigate_action_popup_render_intensity.md`
* `design/architecture/architectural_decisions.md`
* `design/architecture/initial description/action_popup.md`
