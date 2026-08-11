---
author: 
id: F_170
internalId: 012efbb1-c938-4539-a646-0f263e72dea6
title: Bottom of chatlog
status: new
owner: 
affects:
agents:
policy:
after: c7fd4558-b1b2-4b60-82c0-b3c1db400479
---

On the action popup, when the agent is running. We get a lot of 'reasoning' boxes which disapear when done. There are also lots of toolcalls which combine into 1 box. This results in the bottom of the chatlog that continuously jumps: boxes popup and go away making the whole chatlog move.

Instead it would be better to keep a spot reserved for when there is nothing in a state of ´running´. Once something pops up, we remove the placeholder.

If there are multiple ´running´ blocks, reserve equal amount of reserved blocks and show them when the disapear. When a perminent block appears, we can decrease the reserved blocks count until back to 1.

Technically only needed while the conversation is still active (not stopped or completed), but if easier to combine for both, is ok.