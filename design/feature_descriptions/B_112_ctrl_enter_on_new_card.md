---
author: 
id: B_112
internalId: e0010544-02b5-4372-82c7-bc05bd62929c
title: ctrl enter on new card
status: ready
owner: 
affects:
agents:
  - design/activity/card__e0010544-02b5-4372-82c7-bc05bd62929c.json#conversation=agent-14e49446-c942-4dc7-b140-db6a7dcc17c5
  - design/activity/card__e0010544-02b5-4372-82c7-bc05bd62929c.json#conversation=agent-098c6fb9-a680-420a-bbba-243533348f86
policy:
after: 7082348f-6737-4bef-ab60-2fdbcdf5da4e
---

We already solved a similar problem for the input on the action popup: when pressing on ctrl+enter in the 'new card' dialog, the 'add' function should be triggered. this happens ok, but before the card is created, the markdown editor still inserts a newline.

This newline should not be inserted.

## Current state

`NewCardDialog` handles `Ctrl+Enter` on the form during event bubbling. When focus is in `NewCardMarkdownEditor`, MDXEditor receives `Enter` first and inserts a newline before the form creates the card. `handleCreateClick` then reads the updated editor value, so the created card body includes that unwanted newline.

## implementation details

- Intercept `Ctrl+Enter` on the new-card form during capture, before MDXEditor handles the key.
- Prevent the browser's default behavior and stop propagation, then run the existing card-creation path.
- Keep plain `Enter`, `Shift+Enter`, `Escape`, button submission, validation, and error handling unchanged.
- Extend `project_dialogs.test.tsx` with regression coverage proving MDXEditor does not receive `Ctrl+Enter` and the submitted body has no added newline.

## acceptance criteria

- `Ctrl+Enter` creates the card when creation is enabled.
- Pressing `Ctrl+Enter` while focus is in the description does not insert a newline before creation.
- Created card body exactly matches description content present before the shortcut.
- Plain `Enter` and `Shift+Enter` in description still insert newlines.
- Disabled creation remains disabled, and `Escape` behavior remains unchanged.
