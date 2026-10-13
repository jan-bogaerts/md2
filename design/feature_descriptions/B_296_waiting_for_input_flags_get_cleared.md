---
author: 
id: B_296
internalId: 4be6bb38-fb9b-4f3c-b2d5-97aa23fa6ce1
title: waiting for input flags get cleared
status: design
owner: 
affects:
agents:
policy:
---

we recently did a fix to prevent some incorrect states in the activity files of the cards after loading a project.  check the last releases if needed, to see which card triggered this change.

This seems to have been over implemented. when opening a project that had actions 'waiting for input' now appear to have been cleared and just stopped.

Can you see where this is occurring and why? We need to fix this so that not just all 'waitingForInput' states are cleared