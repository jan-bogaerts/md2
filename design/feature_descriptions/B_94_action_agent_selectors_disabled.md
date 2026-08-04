---
author: 
id: B_94
internalId: d00ed22e-f395-4949-9b0f-ce1c2275c31e
title: action-agent-selectors disabled
status: design
owner: 
affects:
agents:
  - design/activity/card__d00ed22e-f395-4949-9b0f-ce1c2275c31e.json#conversation=agent-533e0930-265f-4f69-be03-b18620cb5c6f
policy:
after: 
---

the action-agent-selectors on the action-popup are only enabled when the conversation has not yet started. It is not possible to change a model setting in the middle of a conversation.

This should not be the case. When a conversation has started and the agent is no longer working (so waiting for input from the user), then it is always possible to restart the agent with a different model or security setting and reload the conversation.

The selectors should be disabled while the agent is working (producing output)