---
author: 
id: F_339
internalId: 2f6108ac-7b47-4374-a2c6-292b5871b064
title: improve time reporting
status: design
owner: 
affects:
agents:
  - design/activity/card__2f6108ac-7b47-4374-a2c6-292b5871b064.json
policy:
---
we currently keep track how long a conversation runs. we should improve this measurement and include how much time was spend running tools, reasoning and then the rest. this way, we can see how much time was actually used by the agent itself.

in the action popup's chatlog, we currently show the total time that the conversation ran, we should keep this, but add a tooltip that splits the time up in it's parts, so the user can see the values.

in the stats:

* agent/model performance, measured duration: each bar should be a stack of it's individual time-duration components. Each component its own color, include details in the legend. don't randomly pick colors, but be smart about it, user sees 2 bars per day: 1 for each agent. blocks should be easy to compare, so for instance one agent has a lighter shade of colors then the other agent
* totals by card: again a stack of duration blocks. put colors in legend (each type of duration gets it's own color)