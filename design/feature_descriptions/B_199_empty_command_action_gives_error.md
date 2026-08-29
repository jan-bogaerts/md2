---
author: 
id: B_199
internalId: 72668dda-9401-49ca-adf2-cd433393214d
title: empty command action gives error
status: design
owner: 
affects:
agents:
  - design/activity/card__72668dda-9401-49ca-adf2-cd433393214d.json
policy:
after: 49c227f7-c9c7-4773-a246-b4ec451244f1
---
create new action, switch to command, user gets error 'missing action field command in xxxx'

this is not good, should not show an error just after creation

it even prevents the action from being saved. this is not good. action needs to be savable, even if still missing data.