---
author: 
id: F_132
internalId: a57b89e0-49f4-4c25-9d99-deea222460cd
title: scan agent output for commit ids
status: design
owner: 
affects:
agents:
  - design/activity/card__a57b89e0-49f4-4c25-9d99-deea222460cd.json#conversation=agent-c7887d99-2140-4994-aeeb-099aedd2ddde
policy:
after: e0010544-02b5-4372-82c7-bc05bd62929c
---
scan the agent's output to see if it contains any commit ids, like:&#x20;

`Commit: 88e196e1`

whenever found, store it so the card can show the commit in its list of diffs it can show.

The card already has a list of commit ids normally from other methods. This new commit can perhaps be in the same list.