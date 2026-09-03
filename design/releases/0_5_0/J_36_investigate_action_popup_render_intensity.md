---
author:
id: J_36
internalId: b7b584ed-ea26-43d0-917c-e75337611846
title: reduce action popup update cost
status: ready
owner:
affects:
agents:
  - design/releases/V_0_5_0/card__b7b584ed-ea26-43d0-917c-e75337611846.json
policy:
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt_owner.tsx
  - app/src/components/actions/conversation/action_conversation_chat_integration.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat_selectors.ts
  - app/src/components/actions/conversation/action_conversation_group_list.tsx
  - app/src/components/actions/conversation/action_conversation_history.tsx
  - app/src/components/actions/conversation/action_conversation_render_projection.node.test.ts
  - app/src/components/actions/conversation/action_conversation_render_projection.ts
  - app/src/components/actions/conversation/action_conversation_rendering.test.tsx
  - app/src/components/actions/conversation/action_conversation_reservation.node.test.ts
  - app/src/components/actions/conversation/action_conversation_reservation.ts
  - app/src/components/actions/conversation/action_conversation_transcript.tsx
  - app/src/components/actions/conversation/completed_tool_call_group.tsx
  - app/src/components/actions/conversation/sub_agent_group.tsx
  - app/src/components/actions/run/popup/action_agent_interaction.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/action_popup_content.tsx
  - app/src/components/actions/run/popup/action_popup_runtime.ts
  - app/src/components/actions/run/popup/action_popup_types.ts
  - app/src/components/actions/run/popup/action_usage_summary.test.tsx
  - app/src/components/actions/run/popup/action_usage_summary.tsx
  - app/src/components/actions/run/popup/action_usage_summary_owner.test.tsx
  - app/src/components/actions/run/popup/action_usage_summary_owner.tsx
  - app/src/components/actions/run/popup/action_usage_values_service.ts
  - app/src/components/actions/run/popup/command_action.tsx
  - app/src/data/action_run_types.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/agent/agent_provider_event.js
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_run_transcript.js
  - desktop/src/actions/agent/agent_run_transcript.test.mjs
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_runner_state.test.mjs
  - desktop/src/actions/agent/agent_streaming_event_handlers.js
after: df937269-dfea-443f-b5e4-ef60704df3b5
---
The action popup performs work proportional to the complete conversation for each streamed update, although previous turns and completed groups are immutable. Keep every provider update immediate. Reduce the work per update so it depends on the entries that can still change, not the length of the chat history.

## Current behavior

### Transcript projection

`app/src/services/actions/action_run_registry.ts` preserves entry object references except for the updated entry, but replaces the conversation and `entries` array on every transcript update. `ActionConversationChat` therefore receives a new transcript reference.

`ActionConversationTranscript` then performs all of the following again:

* scans the complete conversation to determine whether provider events are visible;
* filters all visible entries;
* rebuilds the agent-call lookup and every render group;
* reconstructs completed-tool and nested sub-agent group arrays;
* maps all groups into React elements;
* maps and serializes all group keys for reservation tracking.

F\_138 still prevents unchanged `ActionConversationMessage` and `ActionConversationEventRow` bodies from rendering because their entry references remain stable. That does not protect the transcript projection or group wrappers. `CompletedToolCallGroup` and `SubAgentGroup` are not memoized and receive newly allocated group arrays, so unchanged historical wrappers render again.

### Entry lookup

Desktop already owns the canonical conversation and knows which entry it changes. It maintains `providerItemId` indexes for provider events and creates stable IDs and sequences for assistant messages. Those known positions are not included in renderer events, so the renderer searches the complete entries array again.

`appendAssistantMessage` also combines two different cases:

* keyed agent output, for which desktop supplies `messageId` and `sequence`;
* unkeyed command output, which must infer an assistant message when a conversation exists.

The keyed case still eagerly searches for the latest user and assistant before using the supplied message ID, then searches again for that ID. Provider-event updates perform another `findIndex` by provider identity. This repeated lookup cost grows with the complete transcript.

### Usage footer

`ActionUsageSummaryOwner` subscribes to complete live conversations. Assistant text changes their references even though the footer depicts only token usage, completed file changes, and Git-history totals. The footer consequently renders and rescans transcript entries for text-only updates.

The footer is already a leaf inside `ActionPopupBottomRow`; its changing data must remain owned and subscribed to at that leaf. Hoisting footer values into the bottom row would make usage changes rerender the parent and violate the smallest-rendering-boundary architecture rule.

## Required changes

### 1. Preserve canonical entry positions across the bridge

Add the canonical conversation entry index to keyed assistant and provider-event updates.

* Desktop assistant tracking stores the entry index with the assistant item and includes it in keyed assistant updates.
* `recordProviderEvent` includes the index it already resolved through `providerEventEntryIndexes`.
* The renderer updates the entry at that index after validating its message ID or provider identity.
* A missing index, an out-of-range index, or an identity mismatch fails clearly. Do not fall back to searching the transcript for malformed keyed events.
* Recovery and `agentStarted` replace the complete conversation and reset any position-dependent renderer state.

The immutable renderer entries array may still be copied when one entry changes. The goal here is to remove repeated discovery scans, not to introduce a second canonical transcript.

Separate the update contracts and reducer paths for:

* keyed agent output with required `entryIndex`, `messageId`, and `sequence`;
* unkeyed command output, which retains the existing inference behavior where a conversation is present;
* errors, which update logs and do not update transcript messages;
* keyed provider events with required `entryIndex` and provider identity.

Do not add a compatibility flag or optional indexed mode. The two verified callers need distinct behavior and should use distinct typed update shapes.

### 2. Keep immutable history separate from the changing tail

Add a conversation-render projection owner beside the conversation components. It owns stable render snapshots for one displayed conversation:

* immutable history groups;
* the entries and groups that can still change;
* provider-event visibility;
* reservation inputs needed by the changing tail.

Historical groups keep the same object and array references while only the active tail changes. A group moves into immutable history only when incoming lifecycle and ordering information proves it cannot receive another update. At minimum, previous turns before the current user-message boundary are immutable. Within the current turn, completed groups may be sealed when doing so cannot change completed-tool adjacency or sub-agent nesting.

The projection resets and builds once when the displayed conversation path changes or a persisted historical conversation is selected. A keyed update targeting an already sealed entry is an invariant failure, not a reason to rebuild all history silently.

Render immutable history and the active tail through separate components. The history component is memoized and receives a stable groups reference. Memoize `CompletedToolCallGroup` and `SubAgentGroup` once their entry and nested-group references are stable. Only the active message/event and any group whose structure is still changing render for a streamed update.

Preserve transcript order, grouping, expansion state, Markdown output, queued prompts, conversation selection, and stick-to-end behavior. Do not virtualize the transcript as part of this change.

### 3. Make reservation tracking incremental

Reservation state responds to lifecycle changes in the active tail:

* an active group appears;
* an active group completes or becomes immutable;
* the run status changes;
* the displayed conversation changes.

Text or reasoning content changes that leave group identity and lifecycle unchanged must not map or serialize immutable history keys. Preserve the existing reserved-block count and layout behavior.

### 4. Give the footer a self-contained displayed-values service

Add one footer-specific service beside the usage-summary components. It prepares and owns a small stable snapshot containing exactly the values depicted by the footer for its current scope:

* token totals;
* completed file-change totals;
* Git-history totals and commit details;
* whether conversation scope is available;
* the active scope.

The service is stable popup-runtime state and uses `EventTarget` plus `useSyncExternalStore` at its React boundary. It updates depicted values immediately from the existing run, live-run collection, loaded-conversation collection, conversation-selection, history, and scope owners. It recalculates only for changes that can affect a depicted value: `agentUsage`, a completed file-change event, live or loaded conversation membership, history changes, conversation selection, scope changes, or binding changes. Assistant text, reasoning text, command output, timer, and unrelated status updates leave its snapshot reference unchanged.

`ActionUsageSummaryOwner` remains the self-contained leaf. It receives the stable service instance, subscribes with `useSyncExternalStore`, and renders the service snapshot. `ActionPopupBottomRow` must not subscribe to or receive the changing usage values. A footer value change rerenders `ActionUsageSummaryOwner` and `ActionUsageSummary`, but not `ActionPopupBottomRow` or the rest of the popup.

This is a subscription-boundary change only. Token and file-change values remain live; do not batch, debounce, throttle, or delay them.

## Affected implementation

* Update the desktop assistant transcript and provider-event publishers to retain and publish canonical entry indexes.
* Split keyed agent output from unkeyed command output in the shared action-run event types and desktop publisher.
* Update `ActionRunRegistry` to validate indexed updates and replace entries directly.
* Add a focused conversation-render projection owner and tests beside `app/src/components/actions/conversation/`.
* Split immutable history rendering from active-tail rendering and give group components stable props.
* Change reservation tracking to consume active-tail lifecycle changes.
* Add a footer usage-values service beside the popup usage components; keep its React subscription inside `ActionUsageSummaryOwner`.
* Update only the affected popup, bridge, service, and component tests. Existing persistence and canonical conversation ownership remain unchanged.

## Explicitly out of scope

* Changing provider-event frequency.
* Batching, debouncing, throttling, or animation-frame scheduling.
* Transcript virtualization.
* Delaying Markdown, token, file-change, or other visible updates.
* Memory profiling or memory fixes.
* Changing canonical conversation persistence or transcript content.

## Verification

Add deterministic render and service tests using a long immutable history and a small changing tail.

* A keyed assistant update replaces the entry at its supplied index without searching by message ID.
* A keyed provider event replaces the entry at its supplied index without searching by provider identity.
* Invalid indexes and identity mismatches fail clearly.
* Unkeyed command output retains its existing transcript and log behavior.
* Repeated updates to an active message keep immutable-history group and component references unchanged.
* Completed historical messages, completed-tool groups, and completed sub-agent groups do not render during an active-tail content update.
* A structural or lifecycle transition moves eligible groups into immutable history once without changing order or expansion state.
* Reservation state does not inspect immutable history for content-only updates and preserves the existing reserved-block count.
* Token and completed file-change values update immediately.
* Assistant and reasoning text do not change the footer service snapshot.
* A footer value change renders the footer leaf but does not render `ActionPopupBottomRow`.
* Conversation switching, queued prompts, Markdown rendering, and stick-to-end behavior remain unchanged.

Run the directly affected app and desktop tests, then the linters required by each changed subproject. Do not run the full test suites unless separately requested.

## See also

* `design/releases/0_1_0/F_138_reduce_action_popup_rerenders_during_streaming.md`
* `design/feature_descriptions/J_28_finishing_action_very_slow.md`
* `design/architecture/initial description/action_popup.md`
* `design/architecture/initial description/writings/running_actions.md`
* `design/architecture/architectural_decisions.md`