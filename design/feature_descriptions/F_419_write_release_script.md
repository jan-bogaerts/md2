---
author: 
id: F_419
internalId: c9eb5c09-0c01-490f-808c-143ff534322b
title: write release script
status: design
owner: 
affects:
agents:
policy:
---

write a script that will:

* create a new tag on github with the current release number as can be read in [package.json](desktop/package.json)
* use that tag to create a new release on github.&#x20;
  * use the version as the release title
  * for the release notes, use the release\_notes.md files saved in the latest release folder, a sub folder of {