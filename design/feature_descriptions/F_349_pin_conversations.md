---
author: 
id: F_349
internalId: 358764f1-3de7-4aaa-b7e9-b83da22beaa1
title: pin conversations
status: ready
owner: 
affects:
agents:
  - design/activity/card__358764f1-3de7-4aaa-b7e9-b83da22beaa1.json
policy:
branch: f_349_pin_conversations
worktree: 1
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat_integration.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat_selectors.node.test.ts
  - app/src/components/actions/conversation/action_conversation_chat_visibility.test.tsx
  - app/src/components/actions/conversation/action_conversation_chatlog_tracker.node.test.ts
  - app/src/components/actions/conversation/action_conversation_command_service.node.test.ts
  - app/src/components/actions/conversation/action_conversation_item_commands.test.tsx
  - app/src/components/actions/conversation/action_conversation_picker.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_picker.tsx
  - app/src/components/actions/conversation/action_conversation_picker_data.ts
  - app/src/components/actions/conversation/action_conversation_picker_option.tsx
  - app/src/components/actions/conversation/action_conversation_picker_owner.tsx
  - app/src/components/actions/conversation/action_conversation_pin_button.test.tsx
  - app/src/components/actions/conversation/action_conversation_pin_button.tsx
  - app/src/components/actions/conversation/action_conversation_rendering.test.tsx
  - app/src/components/actions/conversation/action_conversation_store.node.test.ts
  - app/src/components/actions/conversation/action_conversation_store.ts
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.grouped.test.tsx
  - app/src/components/actions/run/popup/action_popup_content.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_runtime.node.test.ts
  - app/src/components/actions/run/popup/action_popup_runtime.ts
  - app/src/components/actions/run/popup/action_popup_types.ts
  - app/src/components/actions/run/popup/action_usage_summary.grouped.test.tsx
  - app/src/components/actions/run/popup/action_usage_summary_data.node.test.ts
  - app/src/components/actions/run/popup/action_usage_summary_owner.grouped.test.tsx
  - app/src/components/actions/run/popup/card_action_popup_host_entry.test.tsx
  - app/src/components/actions/run/popup/card_action_popup_host_entry.tsx
  - app/src/components/actions/run/trigger/card_run_button.test.tsx
  - app/src/components/agents/agent_chat_fab.test.tsx
  - app/src/components/card_view/card_worktree_indicator.grouped.test.tsx
  - app/src/components/hooks/use_conversation_pinned.ts
  - app/src/components/shell/pinned_conversation_details_row.tsx
  - app/src/components/shell/pinned_conversations_details.tsx
  - app/src/components/shell/pinned_conversations_indicator.test.tsx
  - app/src/components/shell/pinned_conversations_indicator.tsx
  - app/src/components/shell/project_agent_usage_summary.test.tsx
  - app/src/components/shell/running_agents_indicator.test.tsx
  - app/src/components/shell/status_bar.tsx
  - app/src/data/data_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/agents/agent_acknowledgement_service.node.test.ts
  - app/src/services/agents/agent_conversation_service.node.test.ts
  - app/src/services/agents/agent_integration.test.ts
  - app/src/services/agents/agent_integration.ts
  - app/src/services/agents/agent_usage.node.test.ts
  - app/src/services/agents/project_agent_token_usage_service.node.test.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/release_operations.service.test.ts
  - app/src/services/search/search_regexp_agent.node.test.ts
  - app/src/services/stats/project_stats_schema.node.test.ts
  - app/src/services/stats/project_stats_service.node.test.ts
  - app/src/services/test_support/data_service_test_support.ts
  - desktop/main.js
  - desktop/src/actions/activity/activity_files.js
  - desktop/src/actions/activity/activity_files.test.mjs
  - desktop/src/actions/activity/conversation_pin_events.js
  - desktop/src/actions/agent/agent_conversation.js
  - desktop/src/actions/agent/agent_conversation.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/agent_conversations.mjs
---

some conversations can remain valid for longer time. user should be able to find them fast. So user can 'pin a conversation: put a 'pin' / 'unpin' icon next to the 'conversation selector' at the top row of the action popup. Also, in the selection list, put a pin after all pinned conversations so the user can easily spot a pinned conversation in the list.

When there are pinned conversations, put a pin in the status bar. when user clicks on the pin, a popup opens, very similar to the 'running agents' button on the status bar. The popup contains a list of all the pinned conversations. when user clicks on a conversation, the related action popup opens.

Put the pin in front of the 'running agents' component.

## Current state

`AgentConversation` has no pinned state. Activity JSON persists conversation data and `viewed`; parser defaults missing `viewed`, while atomic backend updates and cross-window events keep that field synchronized. Conversation picker lists current action/context conversations newest first. `AgentIntegration` loads card conversations by `cardInternalId` and project conversations from activity references, but exposes no project-wide pinned projection. Status bar ends with `RunningAgentsIndicator`; selecting its card run calls `CardPopupService`, which can open live runs but cannot target persisted conversation path.

Activity compaction only validates and canonicalizes data; it does not expire conversations. Pinning therefore preserves discoverability, not conversation lifetime.

## implementation details

* Add required runtime `pinned: boolean` to `AgentConversation`. Persist it in activity conversation JSON; migrate a missing value to `false`. New conversations start unpinned. Parsing and repair reject non-boolean values.
* Add atomic `updateActionConversationPinned(reference, pinned)` storage and action-bridge APIs, matching viewed-state write serialization. Preserve stored `pinned` during later run checkpoints so stale live data cannot undo a user choice. Publish pinned changes after disk write; local and remote windows apply only that field before emitting a conversation-ID-scoped event.
* Let `AgentIntegration` own stable project-wide pinned view data. On first pinned-list request, load all current-project activity conversation references, including card- and project-origin records; thereafter merge run updates and pin events by `AgentConversation.id`. Reset data on project switch. Expose it through `EventTarget` and `useSyncExternalStore` without republishing cards.
* Put pin/unpin icon button directly after agent conversation picker. Disable it for `New conversation`; otherwise reflect displayed live or persisted conversation. Toggle through service, update only after backend success, and report failure through `dialogService`. Include tooltip and `aria-label`.
* Include `pinned` in picker projection. Append pin icon to each pinned menu option without changing newest-first ordering or selection identity; paths remain persistence references, while `AgentConversation.id` remains conversation identity.
* Add `PinnedConversationsIndicator` immediately before `RunningAgentsIndicator` in desktop status bar. Hide it when no conversations are pinned. Its button opens existing status-details surface with pinned conversations newest first; each row shows conversation title, start time, action label, and current card title when card-owned.
* Add persisted-conversation opening to `CardPopupService`: resolve card ownership by `cardInternalId`, build context from current card data, select `actionId`, then initialize history selection from conversation path. Project-origin conversations use project context. If action or card no longer exists, keep row visible but unavailable and report reason through `dialogService` when selected.
* Add parser/persistence, bridge/event, service projection, picker toggle/marker, status indicator, project reset, historical-open, missing-target, and error tests. Run affected app and desktop tests plus each subproject linter.

## acceptance criteria

* Selected persisted or live conversation can be pinned and unpinned from icon beside picker; `New conversation` cannot be pinned.
* Pin state survives reload and project reopen. Later conversation checkpoints and changes from another window do not revert it.
* Every pinned picker option shows pin marker; unpinned options do not. Existing newest-first order remains unchanged.
* With at least one pinned conversation, status-bar pin appears immediately before running-agents control. With none, pin control is absent.
* Status popup lists every pinned card- and project-origin conversation in current project, newest first, with enough action/card context to distinguish equal titles.
* Selecting available row opens related action popup on exact conversation, including completed historical conversation with no live run.
* Renamed or moved card still opens because ownership resolves through `cardInternalId`, not stored path. Missing card or action leaves row visible and produces clear error instead of opening wrong popup or throwing during render.
* Pin write or load failure leaves last confirmed state intact and is reported through `dialogService`.
