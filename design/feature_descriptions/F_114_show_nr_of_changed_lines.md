---
author: 
id: F_114
internalId: 0ef8b9a6-ac40-4617-b077-17260b17a61c
title: show nr of changed lines
status: new
owner: 
affects:
agents:
  - design/activity/card__0ef8b9a6-ac40-4617-b077-17260b17a61c.json#conversation=agent-7b1df570-7675-472d-8967-346590bfccf1
policy:
after: a529defa-f2ad-4307-923b-856a8ce80243
branch: f_114_show_nr_of_changed_lines
worktree: 1
---
while an agent is running, it produces 'diff's for updating files. This allows us to see how many lines are changed. we should show this to the user