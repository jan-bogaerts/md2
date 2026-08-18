---
author: 
id: B_142
internalId: 5936b8d1-a0b9-4d53-9edf-e753e80796dd
title: changed and added lines in action not correct
status: design
owner: 
affects:
agents:
policy:
---

when an agent changes files, we track the total of lines changed, deleted and added. it seems we either display it incorrectly or something is going wrong while tracking it.

the action only shows changed/deleted, not nr of lines that were added. so the count is way off.