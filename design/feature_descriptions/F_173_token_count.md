---
author: 
id: F_173
internalId: bee2d3c7-81e1-451a-bc4d-d4ba59c849e9
title: token count
status: design
owner: 
affects:
agents:
  - design/activity/card__bee2d3c7-81e1-451a-bc4d-d4ba59c849e9.json
policy:
---
during a release, the token count began to change up and down like crazy. clear indication that something is going wrong during the calculation of the token usage.

We should also perform a validation on the way that token count is calculated, we need to make certain that it is correct.

token usage of released cards is no longer going to change. we can keep the summaries for these cards in more convenient places, like in a project wide json file for instance.