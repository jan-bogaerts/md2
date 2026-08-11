---
author: 
id: F_170
internalId: 012efbb1-c938-4539-a646-0f263e72dea6
title: Bottom of chatlog
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__012efbb1-c938-4539-a646-0f263e72dea6.json#conversation=agent-465b2d60-e4cf-44ac-867b-2651c3acdba2
  - design/activity/card__012efbb1-c938-4539-a646-0f263e72dea6.json#conversation=agent-516ae5d4-080a-4c57-8d02-bc767bdc6391
policy:
---

On the action popup, when the agent is running. We get a lot of 'reasoning' boxes which disapear when done. There are also lots of toolcalls which combine into 1 box. This results in the bottom of the chatlog that continuously jumps: boxes popup and go away making the whole chatlog move.

Instead it would be better to keep a spot reserved for when there is nothing in a state of ´running´. Once something pops up, we remove the placeholder.

If there are multiple ´running´ blocks, reserve equal amount of reserved blocks and show them when the disapear. When a perminent block appears, we can decrease the reserved blocks count until back to 1.

Technically only needed while the conversation is still active (not stopped or completed), but if easier to combine for both, is ok.

## Current state

`ActionConversationChatOwner` selects live conversation and run status. `ActionConversationChat` filters canonical `conversation.entries`, builds display groups, and renders them in ingestion order. It keeps viewport pinned to end unless user scrolls up.

Completed reasoning events are removed from visible entries. Adjacent completed tool calls collapse into one `CompletedToolCallGroup`; running tool calls remain separate. These transitions reduce rendered block count and height. Because chat has no bottom-space reservation, existing content moves downward or upward even while viewport remains pinned.

## Implementation details

* Define **running block** as visible reasoning or tool event whose status is `started`, `inProgress`, or `running`. Define **permanent block** as newly rendered message, failed or declined event, completed standalone event, or completed tool-call group that remains in chat.
* Add chat-local reservation tracking beside `ActionConversationChat`. Reservation state is presentation state for selected conversation, not persisted conversation data or action-run domain state.
* While run status is `queued`, `running`, or `waitingForInput`, keep at least one reserved slot. A reserved slot is one non-interactive placeholder with fixed standard height, matching normal collapsed event-row scale.
* A running block consumes one reserved slot. When simultaneous running-block count exceeds reserved slot count, grow reservation to that count. When a running block disappears, render its now-unused reserved slot so bottom space remains stable.
* When new permanent blocks appear, reduce unused reserved slots by number of new permanent blocks, never below one total reserved slot during active conversation. Do not count in-place updates, tool-call regrouping, or restored historical entries as new permanent blocks.
* When selected conversation changes, reset reservation tracking for new conversation. When conversation becomes terminal or idle, remove all placeholders and reset tracking. Preserve existing scroll-stickiness, entry order, completed-reasoning filtering, tool grouping, event expansion, and accessibility behavior.
* Put placeholder rendering and reservation calculations in focused files under `app/src/components/actions/conversation/`; keep `ActionConversationChat` as layout owner. Add focused tests covering lifecycle transitions and scroll behavior. No desktop, persistence, parser, or canonical conversation-model changes are required.

## Acceptance criteria

* Active conversation with no running block shows one fixed-height placeholder at bottom of chat.
* Each simultaneous running block consumes one reserved slot; if running blocks disappear without permanent output, same number of fixed-height placeholders replaces them.
* Each newly added permanent block releases one unused slot until reservation returns to one slot; active conversation never reserves fewer than one slot.
* Completing reasoning, completing and grouping tool calls, and receiving permanent messages do not make bottom of pinned chat jump because removed transient blocks are replaced by reserved space.
* User who scrolled up remains at chosen position while entries or placeholders change. User pinned to bottom remains pinned.
* Switching conversations does not reuse previous conversation's reservation count. Terminal or idle conversation shows no placeholder.
* Existing conversation entry order, reasoning visibility, tool-call grouping, expansion state, status labels, and accessible controls remain unchanged.
* Focused chat tests pass, including one, multiple, consumed, released, reset, terminal, and scrolled-up reservation cases.
