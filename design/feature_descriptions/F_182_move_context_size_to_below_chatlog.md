---
author: 
id: F_182
internalId: 4bb52e4a-38c7-47bd-9fe8-c49cdd08c0b0
title: Move context size to below chatlog
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4bb52e4a-38c7-47bd-9fe8-c49cdd08c0b0.json#conversation=agent-33c7d35c-bfa8-4a17-9ee3-bac61ca38fd8
  - design/activity/card__4bb52e4a-38c7-47bd-9fe8-c49cdd08c0b0.json#conversation=agent-ecbfc86c-1205-4b23-b963-a7e5614f908d
policy:
branch: f_182_move_context_size_to_below_chatlog
worktree: 3
---

Move context-window usage below the chatlog, on the same row as the duration timer and aligned right.

# Current state

[F_122](F_122_show_conversation_context_window_usage.md) added `AgentConversation.contextWindowUsage` and displays its whole-number percentage as `context: N%` inside `ActionUsageSummary` in the popup bottom row. This mixes selected-conversation context occupancy with action/card token, change, and line totals.

`ActionConversationChat` owns the scrollable transcript and appends the status and `ConversationTimer` inside that scroll area. It hides both status and timer when popup run status is `idle`, so a completed selected conversation has no visible duration. `ActionConversationChatOwner` already supplies the live conversation or selected persisted conversation, so the chat boundary has the data needed for both duration and context occupancy.

Here, **chatlog** means the scrollable conversation transcript. **Metadata row** means the pinned, non-scrolling row directly below that transcript. **Context-window usage** means the displayed conversation's latest `usedTokens / capacityTokens` percentage, not cumulative token usage.

# Implementation details

- Refactor `app/src/components/actions/conversation/action_conversation_chat.tsx` into a scrollable transcript plus a metadata row below it. Keep transcript scrolling and sticky-to-end behavior on the transcript only.
- Align metadata-row items on one baseline. Keep status and duration on the left; render `context: N%` on the right with caption styling. Use flexible space so context stays right-aligned.
- Show `ConversationTimer` whenever a conversation exists, including when popup status is `idle`. Keep status text hidden for `idle`. `ConversationTimer` must schedule ticks only while status is `running`; for `idle`, waiting, completed, failed, or cancelled states it displays its current or completed value without advancing.
- Move context percentage presentation out of `app/src/components/actions/run/popup/action_usage_summary.tsx`. Preserve token, change, line, tooltip, and scope-toggle behavior in the popup bottom row.
- Reuse the existing validated percentage calculation from `action_usage_summary_data.ts`, relocating it to conversation-owned code if needed so conversation components do not depend on popup-specific data modules. Continue rounding to a whole number, capping at `100%`, and hiding invalid or unavailable values.
- Use the live conversation while a run exists; otherwise use the selected persisted conversation. Switching conversations must update duration and context metadata together.
- No desktop, persistence, or conversation-schema change is required because F_122 already stores and restores `contextWindowUsage`.
- Update chat, timer, usage-summary, and owner tests. Cover pinned layout, idle duration, non-running timer freeze, context placement, conversation switching, and unavailable context data.

# Acceptance criteria

- Conversation with `usedTokens = 42,000` and `capacityTokens = 258,400` shows `context: 16%` at right of metadata row below chatlog, level with duration timer.
- Metadata row remains outside scrollable transcript; scrolling chat messages does not scroll duration or context away.
- Selected completed conversation shows its duration while popup status is `idle`. Duration does not advance while idle.
- Duration advances only while status is `running`; waiting, completed, failed, cancelled, and idle states remain frozen.
- Status text remains hidden for `idle`; non-idle status behavior remains unchanged.
- Switching displayed conversations updates duration and context from same displayed conversation. Missing or invalid context usage hides context label without hiding duration.
- Popup bottom row no longer shows context percentage. Existing token, change, line, scope, selector, and run-control behavior remains unchanged.
