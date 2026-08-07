---
author: 
id: B_95
internalId: f63b1866-ff7a-4fe9-b984-06cf1284f74e
title: after action name-change actions not correctly refreshed
status: new
owner: 
affects:
agents:
policy:
after: 4aa237a7-a946-4ce7-84ba-962826a44dfa
---

I changed the label of an action, which changed the filename. Now the action had already been used during the run of the application. When a new action-popup was opened, the prompt could not be prepared for the action.

on the ui, the action was using the new label, but it produced an error while trying to prepare the prompt, no prompt was built and the error still referred to the old action file.