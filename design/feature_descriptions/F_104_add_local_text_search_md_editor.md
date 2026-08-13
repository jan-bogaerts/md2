---
author: 
id: F_104
internalId: d47986a5-1380-4dd1-adb9-fff106a9a143
title: add local text search md editor
status: design
owner: 
affects:
agents:
  - design/activity/card__d47986a5-1380-4dd1-adb9-fff106a9a143.json#conversation=agent-b10ebe9e-02b2-405f-8aca-d5ad93e95550
policy:
after: 56f68e51-66b5-4b47-9cf2-6a47128a0cb6
---
Add local text search to the markdown editor so that it becomes available in all components that use the markdown editor.

The toolbar should contain a search button which opens a small popup where the search term can be entered.

Ctrl+F also opens the search popup.

When the search popup opens, and some text it selected in the markdown editor, use that as default search value.

when search starts, select the first result down from the cursor. `F3` goes to the next search value