---
author: 
id: B_210
internalId: df7f7a94-ee33-44a3-b499-2b230d484fef
title: incorrect layout action popup for commands
status: new
owner: 
affects:
agents:
policy:
after: ccff9568-68bb-468f-85e7-37d06bd37b59
---
for command actions, the layout is incorrect: we show a splitter above the markdown input and the run history below the input.

the splitter should be between markdown editor and run history. it should be different from the agent-actions: it's position needs to be saved with a different config name.

also: do this properly: so no splitter in the same component as the markdown editor, but the command-action  component should contains input, splitter, history and agent-action component should contain chatlog-splitter-input. both components are allowed to have more, as architecture needs it, but this should be the basis