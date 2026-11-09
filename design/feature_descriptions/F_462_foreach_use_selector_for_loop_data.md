---
author: 
id: F_462
internalId: 9ee3f856-14a9-495a-88f7-a06cca186ac6
title: foreach use selector for loop data
status: design
owner: 
affects:
agents:
policy:
---

We recently added support for the `for-each` feature, which lets the engine perform a prompt over a series of data records. So, for each record in the list, a prompt is run.

We can currently only select a json file. the system will open it, if it is a list, it will loop over every item, if it is an object, it will only run the prompt 1 time with the record as input.

We need to improve processing of json files that contain a root object. When the user adds the json file as a for-each value, and it is an object, then the user can enter a field selector (like is used for the `{{ data path}}` placeholder.  This way, the user can still select an array that should be used as the loop data.

Also, in the context menu of the 'for-each' button on the action-popup, we currently show 'at end' and 'on failure' menu items. this should be improved. instead of these 2 menu items, use a single menu item 'setup' where user can specify:

* at end
* on failure
* path to list data, if an object