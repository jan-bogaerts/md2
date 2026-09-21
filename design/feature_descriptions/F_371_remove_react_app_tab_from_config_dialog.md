---
author: 
id: F_371
internalId: be40e266-2bca-497c-8bf8-9fb7992ca89a
title: remove react app tab from config dialog
status: design
owner: 
affects:
agents:
policy:
---
The react tab of the config dialog needs to be removed:

* startup splash has no real value, it should always be on, it should not be a configurable value
* delete integrated card branch, delete released card branches, auto commit delay should move to the 'project' tab, 'git' group
* include project agent in activity release should not be an option, remove, this value should always be 'true', so remove from config, consumers of config values should always presume this is true.