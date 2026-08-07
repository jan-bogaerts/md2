---
author: 
id: F_132
internalId: a57b89e0-49f4-4c25-9d99-deea222460cd
title: scan agent output for commit ids
status: new
owner: 
affects:
agents:
policy:
after: fc4d8be4-5bf5-4e9a-924f-adeb44dc0554
---
scan the agent's output to see if it contains any commit ids, like:&#x20;

`Commit: 88e196e1`

whenever found, store it so the card can show the commit in its list of diffs it can show.

The card already has a list of commit ids normally from other methods. This new commit can perhaps be in the same list.