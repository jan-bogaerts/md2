---
author: 
id: F_186
internalId: 146d495f-955a-4b9d-bf70-80520208883d
title: action popup bottom of chat log
status: ready
owner: 
affects:
agents:
  - design/releases/0_4_0/card__146d495f-955a-4b9d-bf70-80520208883d.json
policy:
after: d10103b8-7064-45cf-8b32-df0566889f78
---

we recently implemented `design/releases/0_3_0/F_122_show_conversation_context_window_usage.md`

this seems to work, but we need improvements:

* this row has now been moved outside of the chat log and remains always visible. this is not ok. it is a clear mis understanding of my instructions: the timer should remain visible as in ' it used to be hidden when not running', but doesn't mean 'at all times, from anywhere in the chatlog.
  no, at the bottom of the chatlog is better cause it gives more room to text. this is key here.
  so, we need to move this row to inside the chatlog so that it is below the text and can be scrolled out of view when going up
* it seems that the context value only shows up when the agent is done. these values should be shown as soon as they become available. please check this.&#x20;

# Current state

[F_182](../releases/0_3_0/F_182_move_context_size_to_below_chatlog.md) placed status, duration, and context usage in a metadata row below `ActionConversationChat`'s scrollable transcript. Because the row is a sibling of the transcript viewport, it stays pinned while the user scrolls messages. `ConversationTimer` now renders whenever a conversation exists, including while popup status is `idle`, and advances only while status is `running`.

For Codex, `agent_streaming_adapter.js` receives `thread/tokenUsage/updated` during a turn and immediately emits live cumulative token usage. It retains `contextWindowUsage` until `turn/completed`, however. Only then does `agent_streaming_event_handlers.js` publish that snapshot to live `AgentConversation` state. Context percentage therefore updates after the turn, despite provider data arriving earlier.

Here, **chatlog** means scrollable transcript viewport. **Metadata row** means row containing status, duration, and context usage. **Available** means a valid `thread/tokenUsage/updated` notification has been received; turn completion is not required.

# Implementation details

- Move metadata row into `ActionConversationChat`'s scrollable transcript as its final content, after rendered conversation entries and reserved streaming blocks. Keep existing sticky-to-end behavior: row is visible when transcript is at bottom, but scrolls out of view when user moves upward.
- Keep F_182 timer behavior. Render duration whenever a conversation exists, including `idle`; advance it only while status is `running`. Keep idle status text hidden and other status labels unchanged.
- Include latest valid `contextWindowUsage` in each Codex streaming `usage` event. In live usage handler, forward snapshot with cumulative token usage through existing action-run `agentUsage` update path so `ActionRunRegistry` immutably updates displayed conversation during active turn.
- Replace live context snapshot on every provider notification; never accumulate it. Preserve completed-turn persistence behavior: only turn completion writes snapshot into canonical conversation, so failed or cancelled incomplete turn does not persist live-only context data.
- Preserve existing percentage validation, rounding, `100%` cap, selected-conversation ownership, and unavailable-data hiding. Do not estimate context usage, poll provider, or add popup-owned state.
- Update focused adapter, runner-event, registry, chat-owner, and chat tests. Existing popup bottom-row token, change, line, selector, and control behavior stays unchanged.

# Acceptance criteria

- Metadata row is last content inside scrollable chatlog. At transcript bottom, duration and valid context usage appear below conversation text; after user scrolls upward, row can leave viewport.
- Selected completed conversation still renders duration while popup status is `idle`, but row is not pinned. Duration advances only while status is `running`.
- First valid Codex `thread/tokenUsage/updated` notification updates displayed context percentage before `turn/completed`, agent shutdown, popup reopen, or project reload.
- Repeated notifications replace live context snapshot. Example: `usedTokens = 42,000` and `capacityTokens = 258,400` displays `context: 16%` without adding values from earlier notifications.
- Switching conversations updates metadata from same displayed conversation. Missing, zero, negative, or malformed context data hides context label without hiding valid duration or producing `NaN` or `Infinity`.
- Completed turn persists latest valid snapshot and restores it after reload. Failed or cancelled incomplete turn does not persist live-only snapshot.
- Existing sticky-to-end behavior remains: new content keeps row visible only when user was already at end; new content does not force user back down after user scrolled upward.
