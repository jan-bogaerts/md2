---
author: 
id: B_112
internalId: e0010544-02b5-4372-82c7-bc05bd62929c
title: ctrl enter on new card
status: design
owner: 
affects:
agents:
  - design/activity/card__e0010544-02b5-4372-82c7-bc05bd62929c.json#conversation=agent-14e49446-c942-4dc7-b140-db6a7dcc17c5
policy:
---

We already solved a similar problem for the input on the action popup: when pressing on ctrl+enter in the 'new card' dialog, the 'add' function should be triggered. this happens ok, but before the card is created, the markdown editor still inserts a newline.

This newline should not be inserted.