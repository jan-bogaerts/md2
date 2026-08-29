---
author: 
id: B_199
internalId: 72668dda-9401-49ca-adf2-cd433393214d
title: empty command action gives error
status: design
owner: 
affects:
agents:
policy:
---
create new action, switch to command, user gets error 'missing action field command in xxxx'

this is not good, should not show an error just after creation

it even prevents the action from being saved. this is not good. action needs to be savable, even if still missing data.