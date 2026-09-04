---
author: 
id: B_221
internalId: 9081512a-9bc9-4f11-a43c-1edda64ab53f
title: auto fill input action popup failing
status: design
owner: 
affects:
agents:
  - design/activity/card__9081512a-9bc9-4f11-a43c-1edda64ab53f.json
policy:
---

we have already done a ton of refactoring on this bit, so the code must be a bit of a mess. this should be verified first.

right now this is the problem: sometimes the prompt is filled in a little bit too often. For instance:

* user opens action popup, goes to action, prompt is filled in, so far ok, then he sends the prompt and immediately, a new prompt is filled in. it should have stayed emty.
* user opens action popup, goes to running action which already has a chatlog, prompt is filled int
* user opens action popup, goes to action that is waiting for input and which is showing the pre-made phrases, but still puts a new prompt in the input.

this doesn't always happen. it is random, so probably a timing issue.

anyway, the rule is: fill in for a new conversation, not for a conversation that already has a chatlog.