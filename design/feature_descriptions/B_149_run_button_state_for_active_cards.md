---
author: 
id: B_149
internalId: bf6c8855-1ef1-464b-b1cc-3cfa9d7ee92e
title: run button state for active cards
status: new
owner: 
affects:
agents:
policy:
---

When opening a project, the run buttons don't get the correct initial state like waitingForInput, or unread conversations.

they only update when opening the action popup, so most likely, this is when the activity file gets loaded and the action states gets updated?