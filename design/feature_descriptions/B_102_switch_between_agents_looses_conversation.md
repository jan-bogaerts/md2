---
author: 
id: B_102
internalId: 3616573b-1a04-4f9f-aa5c-88ae92cb1188
title: switch between agents looses conversation
status: design
owner: 
affects:
agents:
  - design/activity/card__3616573b-1a04-4f9f-aa5c-88ae92cb1188.json#conversation=agent-b0a75c4b-8717-4f9f-a534-b6f273acb43d
policy:
---
&#x20;I tried to switch a conversation from claude to codex, but codex appeared to start from scratch. we need to check if the switching agents works correctly: as the new agent wont have a conversationId to pick up from, we need to sent the current conversation as a whole to the new agent.&#x20;

Even worse. now, when you switch to another agent and send a message, the entire conversation gets lost and it just says 'failed'