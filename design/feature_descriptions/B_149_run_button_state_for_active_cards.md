---
author: 
id: B_149
internalId: bf6c8855-1ef1-464b-b1cc-3cfa9d7ee92e
title: run button state for active cards
status: design
owner: 
affects:
agents:
  - design/activity/card__bf6c8855-1ef1-464b-b1cc-3cfa9d7ee92e.json
policy:
---
When opening a project, the run buttons don't get the correct initial state like waitingForInput, or unread conversations.

they only update when opening the action popup, so most likely, this is when the activity file gets loaded and the action states gets updated?

seems like the 'action' buttons also don't show the state correctly sometimes (after reloading project). the conversation still needs to be 'finished' and the 'run' button shows it correctly (cause we opened the action popup), but the button for the action still waiting for response, is not showing the correct color.

so state calculation is somehow not correct