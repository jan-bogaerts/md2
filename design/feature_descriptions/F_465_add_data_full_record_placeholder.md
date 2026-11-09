---
author: 
id: F_465
internalId: 57c8f8e6-a9fa-4e24-b262-ccacc65cb570
title: add data - full record placeholder
status: design
owner: 
affects:
agents:
policy:
---

We already have support for the `{{ data path}}` placeholder (added space to prevent placeholder to be applied). This version selects a specific field value of the currently active record.

We should also support the placeholder `{{ data }}` , so with no path. This should insert the entire json records (stringified, pretty printed)