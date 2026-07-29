---
author: 
id: F_84
internalId: f316134f-9019-4a02-baee-3a1e02f67151
title: select empty conversation
status: design
owner: 
affects:
agents:
  - design/activity/card__f316134f-9019-4a02-baee-3a1e02f67151.json#conversation=agent-5e4a35dd-dc52-4fd6-b4f2-627940bf049f
policy:
after: 96d2a0da-baf3-4686-b907-9542e58753b9
---

# Goal

After selecting a conversation in the dropdown on an action popup, it is no longer possible to get out of the conversation history. you can select another historical conv, but not an empty one. User needs to be able to select an empty conversation again (top item shouldn't be disabled)

# Current state

`ActionConversationPicker` shows an empty `Conversations` item, but disables it. After choosing history, `handleConversationChange` only loads another persisted conversation, so the popup cannot return to a fresh conversation.

# implementation details

- Keep the empty `Conversations` item selectable when the picker is otherwise enabled.
- Treat its empty value as a reset: clear the selected conversation and displayed chat without loading a conversation.
- A run after reset starts a new conversation and omits `continueFrom`.

# acceptance criteria

- User can select `Conversations` after selecting a historical conversation.
- Popup returns to empty conversation view without an error or empty-path load.
- Next run starts a new conversation; historical selection still continues that conversation.
- Picker and controller tests cover reset and continuation behavior.
