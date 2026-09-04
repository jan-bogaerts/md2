---
author: 
id: F_328
internalId: 1d05ed50-60c4-42a5-b520-fbc0d625361c
title: better show state of project agent
status: design
owner: 
affects:
agents:
  - design/activity/card__1d05ed50-60c4-42a5-b520-fbc0d625361c.json
policy:
branch: f_328_better_show_state_of_project_agent
worktree: 2
---
currently, we have a FAB that shows, hides the project agent's action popup.

We should better show the state of the project agent like is done with the 'run' button on the cards.

* running: show animation
* waiting for response: show with color
* done, not yet seen: also similar as the run button



also, when we make the window smaller, sometimes the FAB goes out of view. the only way to bring it back is to make the window larger again.

can we make it so, that if the FAB would disapear out of view, we make certain that it remains at the edge?