---
author: 
id: F_156
internalId: ade75617-2ab1-40c9-ae62-01700b995632
title: when approval request is shown hide phrases
status: new
owner: 
affects:
agents:
policy:
after: 615b2a1f-55c2-4113-b1ac-589ae3474ae2
---

Currently, when an agent shows an 'approval request' in the action-popup and that action also happens to have predefined phrases (responses), then currently the drawer with the responses is also shown. this is not correct, when we already have an 'approval request' with some buttons, we shouldn't show the drawer with all the prhases. it should remain hidden in this situation