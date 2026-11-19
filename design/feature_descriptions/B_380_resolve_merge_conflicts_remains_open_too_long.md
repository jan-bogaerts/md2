---
author: 
id: B_380
internalId: b93ea5b8-ac54-4402-ba40-b259824fc10a
title: resolve merge conflicts remains open too long
status: design
owner: 
affects:
agents:
policy:
---

When a merge conflict was resolved, the user has to press the 'continue' button to finish the merge again.&#x20;

When this is occurring, the dialog remains open and nothing seems to be happening. This is not a good user experience.

First thing we need to check: why does this dialog remain open for so long after user pressed 'continue'. Is this really required?

Secondly, how can we improve it so the user has a better feedback that processes are running. for instance, we can activate the animation on the worktree selector button? But also, if the dialog needs to remain open, we should add an animation like a spinner there as well, with some text to let the user know what is happening.