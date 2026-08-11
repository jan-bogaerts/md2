---
author: 
id: F_170
internalId: 012efbb1-c938-4539-a646-0f263e72dea6
title: Bottom of chatlog
status: design
owner: 
affects:
agents:
  - design/activity/card__012efbb1-c938-4539-a646-0f263e72dea6.json#conversation=agent-465b2d60-e4cf-44ac-867b-2651c3acdba2
  - design/activity/card__012efbb1-c938-4539-a646-0f263e72dea6.json#conversation=agent-516ae5d4-080a-4c57-8d02-bc767bdc6391
policy:
---

On the action popup, when the agent is running. We get a lot of 'reasoning' boxes which disapear when done. There are also lots of toolcalls which combine into 1 box. This results in the bottom of the chatlog that continuously jumps: boxes popup and go away making the whole chatlog move.

Instead it would be better to keep a spot reserved for when there is nothing in a state of ´running´. Once something pops up, we remove the placeholder.

If there are multiple ´running´ blocks, reserve equal amount of reserved blocks and show them when the disapear. When a perminent block appears, we can decrease the reserved blocks count until back to 1.

Technically only needed while the conversation is still active (not stopped or completed), but if easier to combine for both, is ok.