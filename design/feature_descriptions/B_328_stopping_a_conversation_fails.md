---
author: 
id: B_328
internalId: 9b59a42b-9d2e-4dfd-96b1-cbdb7b51fa05
title: stopping a conversation fails
status: design
owner: 
affects:
agents:
  - design/activity/card__9b59a42b-9d2e-4dfd-96b1-cbdb7b51fa05.json
policy:
---

I have a conversation that is currently in the 'waitingForInput' state. But when I press the `finish conversation` button, nothing happens.

it is very strange, sometimes it works, sometimes it doesn't. If it fails, closing and opening the application fixes it, so it seems to be some broken internal state perhaps?