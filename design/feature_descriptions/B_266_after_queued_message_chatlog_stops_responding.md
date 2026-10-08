---
author: 
id: B_266
internalId: 5785f8fc-1509-47f0-8b60-5b34f03774c1
title: after queued message chatlog stops responding
status: design
owner: 
affects:
agents:
policy:
---

Something strange going on with the chatlog of the active conversation on the action-popup.

after sending a queued message (so a new input while the agent was still doing something so that the message first appears as 'queued'), all output that the agent still sends, is no longer shown on the chatlog.

only after the user clicks on the 'finish conversation' button and the chatlog reloads again, are the messages shown again that the agent sent after the queued message.

this is a but that needs fixing. Now, we already did a few other fixes since, so we need to check if the bug is still valid.