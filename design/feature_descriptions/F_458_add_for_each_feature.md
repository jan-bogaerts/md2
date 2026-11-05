---
author: 
id: F_458
internalId: c9a462cf-7874-4ada-a2f3-df08cf1793b2
title: add for-each feature
status: design
owner: 
affects:
agents:
policy:
after: c406d6e4-8d5d-4036-8b27-264485b2fbe3
---
# General feature description

The user should be able to attach a json list (file) to an action so it will run the same action in a loop on the card where each iteration in the loop is for a record in that list (the record becomes a part of the context for the conversation). All editors that can contain placeholders can then also have the 'data' placeholder, which has a second part for selecting the value in the json data.

* On the agent-action-popup, we have a context menu (prompt menu) that currently contains 2 menu items: `compact` & `add file` , we need to add 'for-each' here, which allows the user to select 1 or more json files that will be attached to the action-prompt as the 'for-each' data
* the placeholder looks like: `{{data xx.xx.x.xx}}` example `{{data countries.0.cities}}` so countries is a list, we take the item at index 0, field 'cities'
* when an action has a 'for-each' file attached, show a `loop` icon behind&#x20;