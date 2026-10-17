---
author: 
id: B_316
internalId: 16c530e0-7832-414c-bb82-b8c7f77ebf93
title: new tasks on second prompt no longer used
status: design
owner: 
affects:
agents:
policy:
---
we recently introduced tracking agent tasks. see [F\_434\_agent\_task\_list\_component.md](design/feature_descriptions/F_434_agent_task_list_component.md)

this works, however, when we send a second prompt and the agent produces a second list of tasks, the 'tasks' component still shows the previous set of completed tasks, not the new list or extended list of tasks