---
author: 
id: B_329
internalId: b71e73f9-ddd6-4a14-bf59-7f9415ad0614
title: changing appearence not applied
status: design
owner: 
affects:
agents:
  - design/activity/card__b71e73f9-ddd6-4a14-bf59-7f9415ad0614.json
policy:
---

In the project section of the config dialog, we can select a background shade color for the application. It seems that this color is only applied after restarting the app or re-opening the project again.

This should be done when the config is saved.

So don't use a global project-wide event monitor for this, but use something specific, so the background only reloads when the config has changed