---
author: 
id: B_104
internalId: 51db4329-b855-4084-9e87-a50d3ce8eb6e
title: wrong prefill of input box on action popup
status: design
owner: 
affects:
agents:
policy:
after: 3913c1ee-9bd7-40df-bfae-1f0188881b8f
---

We already looked at this in the card `design/releases/0_1_0/B_97_when_action_completes_dont_autofill_the_input_again.md` but apparently this was not yet fixed correctly.

* a prefilled message should only be shown for a new empty conversation.
* when the user selects an existing conversation or when the popup automatically goes to the first non-read conversation of an action, the input should not be prefilled.

basically, the rule is simple: is there something in the chatlog history? then don't prefill the input