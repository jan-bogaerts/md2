---
author: 
id: F_157
internalId: a5f03c32-1395-498d-bbfd-10184c78a633
title: file selector popup resizable
status: design
owner: 
affects:
agents:
  - design/activity/card__a5f03c32-1395-498d-bbfd-10184c78a633.json#conversation=agent-d7f00d0f-88d8-4564-b8c8-660ef54c1b00
policy:
---

when the user enters an `at` letter in the markdown editor, we show a file selector popup. This is currently of a fixed size. we should make this resizable. Size should be persisted in the app's local storage configuration (so local to the app)