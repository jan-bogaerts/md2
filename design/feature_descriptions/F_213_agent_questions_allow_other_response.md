---
author: 
id: F_213
internalId: bfad1b82-e967-48bc-af8f-a11ce1fa4a55
title: agent questions allow other response
status: design
owner: 
affects:
agents:
  - design/activity/card__bfad1b82-e967-48bc-af8f-a11ce1fa4a55.json
policy:
after: be9b4114-07cb-48b0-a79f-68654ced052e
---
when an agents asks 1 or more questions, we currently don't appear to allow for any other response. it needs to be a selection between what the agent proposes. this is not ok, we also need to allow for 'other' responses (user enters input instead) or stop the response completely.

while the UI is waiting for responses, it is also not possible to send a different prompt to the agent cause the 'send' button remains disabled (this might have already been resolved recently). when text is entered in the input, the 'send' button should be enabled.