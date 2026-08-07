---
author: 
id: F_135
internalId: db0d6a75-3aa8-49ef-b855-a0cd4253e25d
title: remove custom-prompt as hardcoded action
status: design
owner: 
affects:
agents:
policy:
after: 1e3a953f-e81b-42a5-9586-0dbb87e389f8
---
On the action popup, we currently  have 2 ways to use custom prompts:

* `custom prompt` button
* `+` button

this is too much. 'custom-prompt' should be renamed to '+'  and the '+' should be removed.

There is however a difference between the two: '+' shows an input dialog to provide a name for the new action. this input can also be removed. We will be adding a different way for adding actions from custom prompts soon, so the backend functions can remain.