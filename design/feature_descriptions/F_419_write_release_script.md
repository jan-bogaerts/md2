---
author: 
id: F_419
internalId: c9eb5c09-0c01-490f-808c-143ff534322b
title: write release script
status: design
owner: 
affects:
agents:
  - design/activity/card__c9eb5c09-0c01-490f-808c-143ff534322b.json
policy:
---
write a script that will:

* create a new tag on github with the current release number as can be read in [package.json](desktop/package.json)
* use that tag to create a new release on github.&#x20;
  * use the version as the release title
  * for the release notes, use the release\_notes.md files saved in the latest release folder, a sub folder of  {{releases-folder}}. This folder will have as name, the current release number where the '.' are replaced with '\_'
  * upload the latest build found in `{{repository-folder}}/releases`.&#x20;