---
author: 
id: F_213
internalId: bfad1b82-e967-48bc-af8f-a11ce1fa4a55
title: agent questions allow other response
status: new
owner: 
affects:
agents:
policy:
after: 964ad5f3-3769-462c-a347-1ae01692fb03
---
when an agents asks 1 or more questions, we currently don't appear to allow for any other response. it needs to be a selection between what the agent proposes. this is not ok, we also need to allow for 'other' responses or stop the response completely.

while the UI is waiting for responses, it is also not possible to send a different prompt to the agent cause the 'send' button remains disabled. when text is entered in the input, the 'send' button should be enabled. I don't understand the problem here, we went over this again and again. I think you are over engineering the 'send' button enabled state.