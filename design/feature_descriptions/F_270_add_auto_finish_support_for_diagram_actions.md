---
author: 
id: F_270
internalId: d65c7486-a435-44f6-b2a0-3f6dce01fa35
title: add auto finish support for diagram actions
status: new
owner: 
affects:
agents:
policy:
after: 3a81bbba-94cd-4b06-9c53-198d765510b9
---

We are already able to automatically mark an action as ready when a card enters a specific state.

for diagram actions we can have something similar, but not 'finish when card enters selected state'. it is 'when the diagram file has been created'. we know which file should be created, so we can mark the card as done when the json file is ready.

problem: the current switch for 'finish when card enter selected state' is before the action editor knows that the action is filtered for target type diagram. so we first need to think how we will solve this.