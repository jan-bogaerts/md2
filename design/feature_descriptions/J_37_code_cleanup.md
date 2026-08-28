---
author: 
id: J_37
internalId: 6ec1718f-1770-4446-92e5-c23a0c37da7d
title: code cleanup
status: new
owner: 
affects:
agents:
policy:
---

see: `app\src\components\actions\run\popup\action_agent_interaction.tsx`

it declares `usageSummary` and then passes this into `ActionConversationChat` which is a clear violation of this project's react code instructions.

Is there a grounded reason for doing this? if not, we need to put the component where it belongs.