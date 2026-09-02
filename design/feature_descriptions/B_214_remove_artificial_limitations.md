---
author: 
id: B_214
internalId: 6f26ee8a-2ac0-4b8b-aad9-2953cbf7dcc1
title: remove artificial limitations
status: design
owner: 
affects:
agents:
policy:
---

apparently, the implementation of the diagram display introduced limitations that were not asked for:&#x20;
`The implementation limits diagrams to 9 nodes and 12 edges, except entity diagrams allow 8 nodes, sequence diagrams 5 participants, and dependency diagrams 14 edges. Architecture allows 3 groups. These limits are enforced in diagram_data.ts`

this is not acceptable. the diagrams should be allowed to have any size.

first: is there a technical reason why this was introduced (not because it was in the design spec, cause it was not in the original, not in git, if it is in there, you put it there without my approval).

second, if there is a technical reason: work out a better way.

finally: remove the limitations