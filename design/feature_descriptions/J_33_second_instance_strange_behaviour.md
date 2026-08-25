---
author: 
id: J_33
internalId: 7f35084a-0348-4869-a764-e0ff2ff2843d
title: second instance strange behaviour
status: design
owner: 
affects:
agents:
  - design/activity/card__7f35084a-0348-4869-a764-e0ff2ff2843d.json
policy:
after: db4400c0-0d7f-4265-8939-8b4e493c7208
---

When a second instance is started, the app behaves a little strange at startup:

* screen remains blank for a long time
* eventually, main window loads and shows no project loaded
* when trying to load a project, the list with previously loaded folders is emptied, while when the first instance was started, there were items in the list. somehow they got lost

we need to investigate what the problem here is