---
author: 
id: F_83
internalId: 31eb5a7b-6d2b-407c-a83f-8e6c9c0201f3
title: chatlog sticky at end
status: new
owner: 
affects:
agents:
  - design/activity/card__31eb5a7b-6d2b-407c-a83f-8e6c9c0201f3.json#conversation=agent-43afb182-62e7-4aba-9fa5-3aa60b6b4c1a
policy:
after: 45d9a15f-7eaf-4993-8bf5-4606c21ec9c3
---

# Goal

when chatlog is loaded, auto scroll to end, keep it sticky at end while it is at end

# Current state

`ActionPopupContent` provides the chat scroll container. `ActionConversationChat` renders the selected or live conversation, but neither component tracks whether the viewport is at the end. Loading a conversation and streaming new content therefore leave the scroll position unchanged.

# Implementation details

- Make `ActionConversationChat` own its scroll viewport and bottom-stick state.
- Treat a viewport within a small tolerance of its maximum scroll position as being at the end.
- Start at the end when a conversation loads or the selected conversation changes.
- After messages or streamed assistant content grow, scroll to the end only when the viewport was already at the end.
- Update stickiness on user scroll. Scrolling up stops automatic movement; returning to the end enables it again.
- Keep empty and shorter-than-viewport conversations at the end without errors.

# Acceptance criteria

- Opening or selecting a conversation shows its latest content.
- New messages and streamed content remain visible while the chat is at the end.
- New content does not move the viewport after the user scrolls up.
- Scrolling back to the end restores sticky behavior.
- Behavior is shared by card and project agent popups.
- Component tests cover initial load, conversation changes, content growth, opt-out, and reactivation.
