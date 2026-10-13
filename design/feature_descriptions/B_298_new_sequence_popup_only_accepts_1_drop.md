---
author: 
id: B_298
internalId: 04c53429-e249-4be6-8a62-8480a72be879
title: new sequence popup only accepts 1 drop
status: design
owner: 
affects:
agents:
  - design/activity/card__04c53429-e249-4be6-8a62-8480a72be879.json
policy:
---
The 'new sequence' popup shows a drop target where the user can drop cards on. this works, but as soon as the first card is dropped, the drop target disappears and no more cards can be dropped.&#x20;

Things that need fixing:&#x20;

* show drop target always at bottom so new cards can be added
* allow dropping on another entry to take it's place. the existing item will move 1 down
* also, no need to show the file path.