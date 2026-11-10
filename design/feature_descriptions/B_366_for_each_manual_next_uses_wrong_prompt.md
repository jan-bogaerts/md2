---
author: 
id: B_366
internalId: 0854ba27-f1f7-4696-9031-d8824a01f4da
title: for-each manual-next uses wrong prompt
status: design
owner: 
affects:
agents:
policy:
---

The for-each now supports a manual 'next' function so the user can decide when to go to the next record (with a button on the action-popup's input area).

This works sort of, but the wrong prompt is used to start the next record. it seems to use the last prompt that was sent, but it should be the first prompt again