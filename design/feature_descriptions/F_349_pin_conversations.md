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
changedFiles:
  - app/src/components/actions/conversation/action_conversation_chat.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat_integration.grouped.test.tsx
  - app/src/components/actions/conversation/action_conversation_chat_selectors.node.test.ts
  - app/src/components/actions/conversation/action_conversation_chat_visibility.test.tsx
  - app/src/components/actions/conversation/action_conversation_chatlog_tracker.node.test.ts
  - app/src/components/actions/conversation/action_conversation_command_service.node.test.ts
  - app/src/components/actions/conversation/action_conversation_item_commands.test.tsx
  - app/src/components/actions/conversation/action_conversation_link_navigation.node.test.ts
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
  - app/src/components/actions/run/popup/action_popup_frame.tsx
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
  - app/src/components/config/config_page.test.tsx
  - app/src/components/config/config_page.tsx
  - app/src/components/hooks/use_conversation_pinned.ts
  - app/src/components/hooks/use_project_config.test.ts
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
  - app/src/services/agents/conversation_pin_service.node.test.ts
  - app/src/services/agents/conversation_pin_service.ts
  - app/src/services/agents/project_agent_token_usage_service.node.test.ts
  - app/src/services/card_popup_service.test.ts
  - app/src/services/card_popup_service.ts
  - app/src/services/config/config_entries.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/config/config_service.ts
  - app/src/services/data/data_service.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/project/project_loading.ts
  - app/src/services/project/project_read_only_guards.service.test.ts
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
  - desktop/src/project/project_files.js
  - desktop/src/project/project_files.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
  - shared/agent_conversations.mjs
after: 385eccb9-06c4-4d93-8f8a-5f9b9f42e45f
---

Some conversations remain useful long after they finish. Pinning gives users a project-wide shortlist from which they can identify and reopen those conversations quickly. Pinning affects discoverability only; it does not change conversation lifetime or activity compaction.

## User experience

* A pin/unpin icon appears directly after the conversation picker in the action popup.
* `New conversation` cannot be pinned.
* Pinned entries in the conversation picker show a pin marker. Existing newest-first ordering remains unchanged.
* When the project has pinned conversations, `PinnedConversationsIndicator` appears in the status bar immediately before `RunningAgentsIndicator`.
* Selecting the indicator opens the existing status-details surface. It lists pinned conversations newest first with conversation title, start time, action label, and current card title for card-owned conversations.
* Selecting an available row opens the related action popup with that exact persisted conversation selected.

## Architecture

### Ownership and persistence

`ConfigService` owns the persisted ordered list of stable conversation locators. `ConversationPinService` exposes the pin-domain projection and scoped events used by conversation UI.

The list is persisted as `pinnedConversations: PinnedConversationLocator[]` in `md2.config.json`. Each locator stores the canonical conversation ID plus `cardInternalId` for card-owned conversations, or the action context kind for conversations without a card. Paths are not stored because release, archive, and other moves can change them. A missing list loads as empty. The service resets from the loaded project configuration whenever the project changes.

`AgentConversation.id` is the pin identity. Conversation paths remain persistence references used to load and open history; they are never used as pin identity.

### Writes and cross-window synchronization

`ConversationPinService.setPinned(locator, pinned)` asks `ConfigService` to update the locator list. `ConfigService` serializes all project-config writes, applies each mutation to its latest canonical state, and persists the complete config through the active storage service. The pin service publishes state only after the write succeeds, so a failed write leaves the last confirmed snapshot intact.

Project-file watching reloads externally changed config into `ConfigService`. `ConversationPinService` subscribes to config changes and refreshes its projection from the canonical locator list. Aggregate and conversation-scoped `EventTarget` notifications support `useSyncExternalStore` subscriptions without republishing cards or conversation collections.

Project-config drafts exist only while the settings dialog is open. Reloaded or persisted pin identities are rebased into an open draft, so saving settings cannot restore an older pin list.

### Pinned conversation projection

`AgentIntegration` owns only the view projection used by the status popup. Opening the popup requests that projection. It resolves each locator through the current card's activity references or the project activity path, loads only those distinct activity files, and selects records whose `AgentConversation.id` occurs in `ConversationPinService`.

The projection is sorted by `startedAt`, newest first. Run updates refresh matching projected conversations, while pin-service events add or remove entries. An unresolved pin reloads activity files only while the popup is open; otherwise the next popup opening performs the load. Project changes clear the projection and its loaded candidates before the next project list is resolved.

### UI subscriptions

The picker pin button and picker options subscribe to one conversation ID through `ConversationPinService`. The status indicator subscribes to the locator list for visibility and count, and the open popup subscribes to the projected records from `AgentIntegration`. Subscriptions live in the smallest component that renders the changing value.

The pin button is disabled while its write is pending. Write and load failures are reported through `dialogService`.

### Opening pinned history

`CardPopupService` opens a pinned conversation by resolving its action and current context:

* Card-owned conversations resolve the card through `cardInternalId`, build context from current card data, select `actionId`, and initialize history selection from the stored conversation path.
* Project-owned conversations use project context and initialize the same persisted-history selection.
* A renamed or moved card still resolves through `cardInternalId`.
* Missing cards or actions leave the row visible but unavailable. Selecting it reports the reason through `dialogService`.

## Verification

Coverage includes project-config validation and serialized persistence, pin-service state and config-reload events, project reset, pinned projection, picker controls and markers, status indicator behavior, historical opening, missing targets, and write/load failures. Run the affected app and desktop tests and both subproject linters.

## Acceptance criteria

* Selected persisted or live conversation can be pinned and unpinned from icon beside picker; `New conversation` cannot be pinned.
* The project-level pinned identity list survives reload and project reopen.
* Pin changes from another window appear without reloading the project.
* Conversation updates do not change the project pin list.
* Every pinned picker option shows pin marker; unpinned options do not. Existing newest-first order remains unchanged.
* With at least one pinned conversation, status-bar pin appears immediately before running-agents control. With none, pin control is absent.
* Status popup lists every pinned card- and project-origin conversation in current project, newest first, with enough action/card context to distinguish equal titles.
* Selecting available row opens related action popup on exact conversation, including completed historical conversation with no live run.
* Renamed or moved card still opens because ownership resolves through `cardInternalId`, not stored path. Missing card or action leaves row visible and produces clear error instead of opening wrong popup or throwing during render.
* Pin write or load failure leaves last confirmed state intact and is reported through `dialogService`.
