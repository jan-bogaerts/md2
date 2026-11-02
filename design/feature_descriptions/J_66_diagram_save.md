---
author: 
id: J_66
internalId: ac32ed09-2e05-4ae3-9a90-8a03bba61616
title: diagram save
status: design
owner: 
affects:
agents:
policy:
---

we currently have a separate button on the diagram tab of the app bar to save the diagram separately. not certain what the value is of this.

We should remove this and instead use the default save button on the 'home' tab. When a user edits the diagram, it should, like all other cards and actions and such be saved automatically through the [commit_batcher.ts](app/src/data/commit_batcher.ts)