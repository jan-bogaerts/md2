---
author: 
id: F_468
internalId: 56755966-50b9-466a-8a42-cd433b5f1f2d
title: for-each step by step option
status: design
owner: 
affects:
agents:
policy:
---

we recently added the for-each function to actions. See [F_458_add_for_each_feature.md](design/releases/0.11.0/F_458_add_for_each_feature.md) . It automatically iterates over the records and moves to the next record when the agent is ready (stopped or is waiting for input).

This is working, but we now need to add an extra option configurable from the for-each config popup: a checkbox, when checked, the engine will not automatically go to the next record when the agent goes into waitingForInput mode. instead, the engine only advances when the user presses a new 'next' button.

This button should be next to (in front of) the existing `stop` and `send` buttons in the action-popup's input section.