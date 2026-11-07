---
author: 
id: F_258
internalId: 4a113e9b-3ad7-4ed9-87bb-774bbc80bbe2
title: Add support for tags
status: new
owner: 
affects:
agents:
policy:
after: c77f8cf6-36e4-4d0f-a0c8-c0d709519e95
---
* Tags can be assigned to a crad
* 0  1 or more allowed
* Stored as a list in card header
* App keeps track of previously used tags in project vonfig. This is done automatically.
* Tags are stored in the config  so that tag label is key. Value is config object
* A tag can be automatically assigned to al cards in a scheduled sequence (list of cards and action to run on list.