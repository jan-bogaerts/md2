---
author: 
id: B_325
internalId: 6414956f-fccd-4086-974d-cd91d67eab99
title: scheduler lost context when restarting conversation
status: design
owner: 
affects:
agents:
policy:
---

I was in the middle of a conversation when the claude user account reached 100%. So I scheduled a next prompt to be sent when the account usage went back to 0.

This prompt got sent to the claude agent when the user-account -usage was reset back to 0, so far it worked. however, it did not use the previous conversation, but started a fresh new conversation which is not ok.

What needs to happen: when we schedule a new prompt for an action while the conversation was running, then the conversation needs to be continued, like normal, as is always is done when we continue an already existing conversation on a newly started agent cli