---
author: 
id: F_102
internalId: c5d963f2-ca43-419d-bc3c-972199b7e7cd
title: select empty conversation
status: ready
owner: 
affects:
agents:
policy:
after: 8e4a295a-8788-4232-8be7-c97f5a1cf5c8
---

When an action has historical logs and the user selects one, he is no longer able to select an empty 'conversation'

The first item in the context menu is disabled. This is wrong, the user should be able to select it so that he can go back to an empty conversation (the 'now' conversation)

# Current state

`ActionConversationPicker` displays `Conversations` as its empty item but disables it. After history is selected, `handleConversationChange` only loads persisted paths, so popup cannot return to empty conversation state.

# Implementation details

- Keep empty `Conversations` item selectable while picker is enabled.
- Treat empty value as reset: clear selected conversation and displayed chat without calling conversation loader.
- Next run omits `continueFrom` and starts new conversation.

# Acceptance criteria

- User can select `Conversations` after selecting historical conversation.
- Popup returns to empty conversation without error or empty-path load.
- Next run starts new conversation; selecting history still continues selected conversation.
- Picker and controller tests cover reset and continuation behavior.
