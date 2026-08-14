---
author: 
id: F_186
internalId: 146d495f-955a-4b9d-bf70-80520208883d
title: action popup bottom of chat log
status: design
owner: 
affects:
agents:
policy:
---

we recently implemented `design/releases/0_3_0/F_122_show_conversation_context_window_usage.md`

this seems to work, but we need improvements:

* this row has now been moved outside of the chat log and remains always visible. this is not ok. it is a clear mis understanding of my instructions: the timer should remain visible as in ' it used to be hidden when not running', but doesn't mean 'at all times, from anywhere in the chatlog.
  no, at the bottom of the chatlog is better cause it gives more room to text. this is key here.
  so, we need to move this row to inside the chatlog so that it is below the text and can be scrolled out of view when going up
* it seems that the context value only shows up when the agent is done. these values should be shown as soon as they become available. please check this.&#x20;