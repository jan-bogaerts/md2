---
author: 
id: F_212
internalId: e9e0858d-a215-42bb-873e-01848ea6a803
title: Add files changed reference
status: design
owner: 
affects:
agents:
  - design/activity/card__e9e0858d-a215-42bb-873e-01848ea6a803.json
policy:
after: de77178e-987f-437c-9af3-81b704eca3d4
---
We already keep track of file changes done by the agent. We should also keep track of the file paths that were changed, added, deleted and add this list to the header section of the card. Note no need for self reference of card (ex: when agent modifies card)

for the card popup, we already have a 'properties' button that shows a popup. This needs an extra field for the new 'changed files' item.