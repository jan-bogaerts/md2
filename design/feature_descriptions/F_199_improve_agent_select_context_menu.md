---
author: 
id: F_199
internalId: 3c57e994-28e6-432a-af75-d34cc343c70e
title: Improve agent select context menu
status: new
owner: 
affects:
agents:
policy:
after: f5e9bc66-ebde-41f7-ae6e-503e9e8e284a
---

* The menu doesn´t look very good. Lets use sub menus for agent, model and thinking
* When switching between agents, we should better handle other selectors. Perhaps initially fall back to defaults for both agents. Keep track in the activity data which other values were last selected per agent.