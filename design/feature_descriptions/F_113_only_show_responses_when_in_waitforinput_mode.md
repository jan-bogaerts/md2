---
author: 
id: F_113
internalId: 903157da-1625-4516-b5c9-b4880ef7fc40
title: only show responses when in waitForInput mode
status: design
owner: 
affects:
agents:
  - design/activity/card__903157da-1625-4516-b5c9-b4880ef7fc40.json#conversation=agent-e3e142b5-17b5-4477-ad8a-fe6a7c1bbd2f
policy:
after: 
---

When an action has 'response' prompts, the list of buttons is shown below the prompt input as soon as the action starts.
This should only be done when the action is in waitForInput mode.

also, instead of using a full row below the input, lets use a box over the input that hovers over the input at the bottom and slides in