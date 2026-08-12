---
author: 
id: J_28
internalId: 38781d24-46e6-4824-9587-b95bf62a0738
title: finishing action very slow
status: new
owner: 
affects:
agents:
policy:
after: 065a1db8-981d-4e22-8d62-8f8cc5995408
---

When user clicks on 'finish' to complete an action. The ui appears to do a lot:

* action appears to start again, the action-button begins to show 'running' state again. this should not occur
* entire popup seems to 'twitch' and reload. why? this should not happen.
* the entire process appears to take a long time. yet it should be a simple matter of updating a state, saving, updating a few mall sections on the ui.