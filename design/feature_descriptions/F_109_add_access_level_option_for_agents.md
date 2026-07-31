---
author: 
id: F_109
internalId: 0f5a1edf-4b4e-4dea-8c7a-05df83ae1288
title: add access-level option for agents
status: new
owner: 
affects:
agents:
policy:
after: a529defa-f2ad-4307-923b-856a8ce80243
---
by default, the agents run in sandbox-mode which limits what they can do.&#x20;

The user should be able to determine the access-level of the agent. just like the other agent configurations (which agent, model,..) there should be a config for the access level. User should be able to set this at all levels that other agent configs can be set: action config, global default, local chat,...