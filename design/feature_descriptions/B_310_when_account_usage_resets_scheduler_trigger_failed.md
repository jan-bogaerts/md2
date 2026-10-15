---
author: 
id: B_310
internalId: bc79eb8f-91e4-4681-b503-ad6a119019bc
title: when account usage resets scheduler trigger failed
status: design
owner: 
affects:
agents:
policy:
---

Tried to set up a scheduler that would trigger an action. the 'when account usage resets' trigger was selected. for the 'claude' agent and the '5-hour' account usage tracker.

however, nothing happened. Although the account usage indicator clearly showed that the tracker had gone back to 0, no action was started again. so something went wrong, the trigger was not properly detected?