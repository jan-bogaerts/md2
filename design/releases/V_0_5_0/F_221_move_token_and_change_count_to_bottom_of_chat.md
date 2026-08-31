---
author: 
id: F_221
internalId: e04c89e9-d394-435f-8f13-7d4bb9e942ff
title: Move token and change count to bottom of chat
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__e04c89e9-d394-435f-8f13-7d4bb9e942ff.json
policy:
after: c8c6f7ea-f3f2-4666-91f8-85b895a76302
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt_owner.tsx
  - app/src/components/actions/conversation/action_conversation_chat.tsx
  - app/src/components/actions/conversation/action_conversation_chat_integration.test.tsx
  - app/src/components/actions/conversation/conversation_meta_info.tsx
  - app/src/components/actions/run/popup/action_agent_interaction.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/command_action.tsx
---
The bottom row of the action popup is too full. Move token usage and line-change counts to the bottom of the chat log, between the timer and context-window usage.

## Current state

`ActionPopupBottomRow` renders agent selectors, token and line-change usage, and run controls in one row inside the prompt. The usage block therefore competes with prompt controls for horizontal space.

`ConversationMetaInfo` already renders a metadata row below the chat transcript. It shows run status, elapsed timer, flexible space, and context-window usage. **Context-window usage** is the selected conversation's used-token percentage of provider capacity.

`ActionUsageSummaryOwner` supplies usage only for card-scoped agent actions. It supports **conversation scope**, meaning the displayed live or historical conversation, and **action/card scope**, meaning all conversations and captured run history for the selected agent action on that card. Clicking either metric switches the shared scope. Token totals come from provider usage. Line changes use provider-reported insertions and deletions, with captured Git commit totals as fallback.

## implementation details

* Remove `ActionUsageSummaryOwner` and its dedicated layout slot from `ActionPopupBottomRow`. Keep attachment, agent-selector, scheduling, stop, finish, send, and run behavior unchanged.
* Compose the existing usage owner with `ActionConversationChat` for the same card-scoped agent interactions that show it today. Pass it as named metadata content to `ConversationMetaInfo`; do not move usage aggregation or scope state into the chat component.
* Render usage immediately after `ConversationTimer` and before the flexible spacer and `ConversationContextUsage`. Status remains before the timer.
* Keep the metadata row present when usage exists but no conversation or active status exists, so cumulative action/card token usage does not disappear before a conversation is selected.
* Give the metadata row an inline-size query container. Preserve current narrow-width behavior: token and change labels may hide while numeric values, controls, and tooltips remain available.
* Reuse `ActionUsageSummary`, `ActionUsageSummaryOwner`, `ActionUsageScopeStore`, and current history/conversation subscriptions. Preserve conversation/action-card switching, live-run updates, historical selection, number formatting, tooltip definitions, and Git fallback behavior.
* Keep current eligibility unchanged: command actions, project context, and read-only agent popups do not gain a usage summary.
* Update focused popup-bottom-row and conversation integration tests. Assert usage removal from prompt footer, metadata order, live and historical updates, shared scope switching, narrow layout behavior, and unchanged absence rules.

## acceptance criteria

* In a writable card-scoped agent popup, token usage and available insertion/deletion counts appear below the chat transcript, after elapsed timer and before context-window indicator.
* Prompt bottom row no longer contains token or line-change usage. Agent selectors, attachments, scheduling, finish, stop, send, and run controls behave as before.
* Token and change values match existing calculations for both conversation and action/card scopes. Clicking either metric switches both metrics to the other scope.
* Selecting a historical conversation updates timer, token usage, line changes, and context-window usage to that displayed conversation without changing selected scope.
* Live provider usage and file-change events update displayed values without reload. When provider file-change data is absent, captured Git commit totals remain fallback; when neither source has changes, change control remains hidden.
* Before a conversation is selected, available cumulative action/card usage remains visible. Command actions, project context, and read-only agent popups retain current absence of usage summary.
* At narrow popup widths, metadata stays usable without forcing chat wider: labels may collapse, numeric values remain visible, and both controls remain keyboard accessible with existing tooltips.
* Focused action popup and conversation tests pass; app lint passes.
