---
author: 
id: F_458
internalId: c9a462cf-7874-4ada-a2f3-df08cf1793b2
title: add for-each feature
status: design
owner: 
affects:
agents:
  - design/activity/card__c9a462cf-7874-4ada-a2f3-df08cf1793b2.json
policy:
after: c406d6e4-8d5d-4036-8b27-264485b2fbe3
---
# General feature description

The user should be able to attach a json list (file) to an action so it will run the same action in a loop on the card where each iteration in the loop is for a record in that list (the record becomes a part of the context for the conversation). All editors that can contain placeholders can then also have the 'data' placeholder, which has a second part for selecting the value in the json data.

* On the agent-action-popup, we have a context menu (prompt menu) that currently contains 2 menu items: `compact` & `add file` , we need to add 'for-each' here, which allows the user to select 1 or more json files that will be attached to the action-prompt as the 'for-each' data
* the placeholder looks like: `{{data xx.xx.x.xx}}` example `{{data countries.0.cities}}` so countries is a list, we take the item at index 0, field 'cities'
* when an action has a 'for-each' file attached, show a `loop` icon behind the action label in the action button at the top of the action popup. (the loop icon should be something like a horizontal 8)
* also show the loop icon in front of the 'prompt menu' button (vertical dots) that opens the prompt's context menu. The loop icon also opens a context menu where the user can configure the for-each:
  * remove: remove the json file and thus the loop
  * view: view the contents of the json file (external open)
  * at end: sub menu where user can select exclusively out of:
    * compact: when enabled, after every record in the json file, compact&#x20;
    * new conversation: start a new conversation for each record
* if the file only contains an object, than that becomes 1 record. if it contains a list, all items in that list are traversed.
* The electron app is responsible for performing the loop.