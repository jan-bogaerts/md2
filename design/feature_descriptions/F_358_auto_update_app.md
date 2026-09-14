---
author: 
id: F_358
internalId: cf3ba1a5-1822-4aed-9626-f7107f677bac
title: auto update app
status: design
owner: 
affects:
agents:
  - design/activity/card__cf3ba1a5-1822-4aed-9626-f7107f677bac.json
policy:
---

The app is released on github: [https://github.com/jan-bogaerts/md2](https://github.com/jan-bogaerts/md2)

It has official releases. I believe we can do an automatic update from github.&#x20;

so lets add a service that checks if there is a new version available. if so, show the user a snackbar with a button to download and start the installation of the new version