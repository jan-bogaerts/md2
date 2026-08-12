---
author: 
id: B_112
internalId: e0010544-02b5-4372-82c7-bc05bd62929c
title: ctrl enter on new card
status: new
owner: 
affects:
agents:
policy:
after: 38781d24-46e6-4824-9587-b95bf62a0738
---

We already solved a similar problem for the input on the action popup: when pressing on ctrl+enter in the 'new card' dialog, the 'add' function should be triggered. this happens ok, but before the card is created, the markdown editor still inserts a newline.

This newline should not be inserted.