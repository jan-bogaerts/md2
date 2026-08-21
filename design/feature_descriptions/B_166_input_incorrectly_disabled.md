---
author: 
id: B_166
internalId: 8021d46c-cb31-4111-9385-9789a43c6c71
title: input incorrectly disabled
status: design
owner: 
affects:
agents:
  - design/activity/card__8021d46c-cb31-4111-9385-9789a43c6c71.json
policy:
---
The input box on the action popup is sometimes incorrectly disabled.

I stopped a streaming action. then send a new prompt to it. now the input box remains disabled until the 'finish' button is pressed. This is even so after restarting the app, the action begins to work as a single shot conversation, which it isn't.

investigate why this is happening, list the decision mechanism that determines when to disable the input.