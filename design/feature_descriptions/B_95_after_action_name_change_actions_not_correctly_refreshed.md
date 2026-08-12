---
author: 
id: B_95
internalId: f63b1866-ff7a-4fe9-b984-06cf1284f74e
title: after action name-change actions not correctly refreshed
status: design
owner: 
affects:
agents:
policy:
after: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
---

I changed the label of an action, which changed the filename. Now the action had already been used during the run of the application. When a new action-popup was opened, the prompt could not be prepared for the action.

on the ui, the action was using the new label, but it produced an error while trying to prepare the prompt, no prompt was built and the error still referred to the old action file.