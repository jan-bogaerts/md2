---
author: 
id: B_204
internalId: 334525ff-6818-4450-8c04-b63d4c9886f1
title: next conversation on same action only starts if previous ended
status: new
owner: 
affects:
agents:
  - design/activity/card__334525ff-6818-4450-8c04-b63d4c9886f1.json
policy:
after: 3509c194-adbf-4e1c-ad64-6aa9560354b4
---
When the user goes to a new conversation and the previous conversation on the same or anither  action (especially the 'custom' or '+' one) has not been closed completely, then the new one wont start. Is there a tecnical reason for this, otherwise we need to remove restriction