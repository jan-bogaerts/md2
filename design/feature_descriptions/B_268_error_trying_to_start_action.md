---
author: 
id: B_268
internalId: d99027a1-b108-4f1e-9f66-c669b4394cf0
title: error trying to start action
status: design
owner: 
affects:
agents:
policy:
---

tried to start an action on a card, got this error:

> 1 failed action

* (main): Card has no frontmatter: design/feature descriptions/F\_288\_clear\_dashboard\_values.md



it makes little sense. the card was simply available in the UI. We did remove a flush when selecting an agent, but the flush should happen when starting the action, most likely this got removed as well. check it