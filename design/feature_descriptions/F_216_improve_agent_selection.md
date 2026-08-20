---
author: 
id: F_216
internalId: 902e08a9-8b29-4037-ab3d-92d53aef4fc8
title: improve agent selection
status: new
owner: 
affects:
agents:
policy:
after: 8c0611fd-44e8-4f65-bc86-11c26afacc8e
---

right now, on the action popup, when changing the agent in the agent-selector component, it is a bit annoying: when agent changes, model and thinking level switch to 'none' which means the user always has to enter a model and thinking level as well, which means re-opening the context menu and such. this is annoying.

what we want:

* for each agent, set the default model and thinking level in the config dialog
* when switching agent, if the action-card combo (so in the activity file of the card) had already stored a model and thinking level for that agent from a previous selection, use that value, otherwise use the default values.
* if the user switching agent or model or thinking level, save cofig in card activity, already partly done I think, but we need to save model and thinking level per agent and then separately the currently active agent.