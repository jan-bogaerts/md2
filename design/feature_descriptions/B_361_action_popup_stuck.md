---
author: 
id: B_361
internalId: d2e9440e-e79e-4abe-9092-d786540e29d3
title: action popup stuck
status: design
owner: 
affects:
agents:
  - design/activity/card__d2e9440e-e79e-4abe-9092-d786540e29d3.json
policy:
---
We were doing a conversation in an action popup. there were a couple of tasks to complete. the UI appeared as if it was stuck on task 2, and everything was still running.

however, when I tried to send a new prompt, we got:

> Failed to send
> Action run no longer accepts queued prompts: action-ff817ecc-7aa9-4c48-9598-f408510baec0

The ui was clearly in a bad state, the prompt was ready but the UI did not see it. I think something got broken perhaps in recent refactoring?

note: this was with a claude agent