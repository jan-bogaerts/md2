---
author: 
id: F_408
internalId: 45e13c03-d74d-4082-9065-aa387f6553f5
title: add close icon to search boxes
status: to fix
owner: 
affects:
agents:
  - design/activity/card__45e13c03-d74d-4082-9065-aa387f6553f5.json
policy:
changedFiles:
  - app/src/components/actions/conversation/search/action_conversation_search_controls.test.tsx
  - app/src/components/actions/conversation/search/action_conversation_search_row.tsx
  - app/src/components/editor/local_search/markdown_local_text_search_plugin.tsx
  - app/src/components/editor/markdown_editor_local_text_search.test.tsx
  - app/src/components/shell/search/search_control.test.tsx
  - app/src/components/shell/search/search_panel.tsx
---
We have search boxes in various places:

* global search
* search in action popup (chat log)
* search on card popup

they don't have close buttons. lets add them