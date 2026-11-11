---
author: 
id: B_367
internalId: 212c070c-0ec8-4bed-be93-77c2d0b8fd99
title: non streaming conversations cant use a plan or task list
status: design
owner: 
affects:
agents:
  - design/activity/card__212c070c-0ec8-4bed-be93-77c2d0b8fd99.json
policy:
---

When starting an action that is not configured a streaming, we still appear to ask the agent to prepare a plan.

codex replied with:

> I’ll use update_plan for multi-step work and explicit task lists, and skip it for simple requests and answer-only questions.

No plan request was done, it was just to shorten a text.

so most likely, we also pass the switch to use plans when we are in non-streaming mode. this is wrong.