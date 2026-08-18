---
author: 
id: B_132
internalId: 59bd8e9d-206f-441d-93c0-35b60d01f2bb
title: card and action popup no longer report unread actions
status: new
owner: 
affects:
agents:
policy:
after: 5d0cd5cb-d69f-4e88-a662-45dfeb6f421b
---

When an action completes on a card and the conversation has unread messages, we normally indicate this both on the 'run' button of the card as well as on the action button on the action popup. since recent refactor, we seem to have lost this.