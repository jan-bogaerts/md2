---
author: 
id: B_87
internalId: 1b39ee56-e06e-4705-840f-7541b2a57d3d
title: Card changed not pushed to mobile
status: new
owner: 
affects:
agents:
  - design/activity/card__1b39ee56-e06e-4705-840f-7541b2a57d3d.json#conversation=agent-6e7b30ea-5d5c-439b-b2b0-7f656fe5a400
policy:
---

When an agent changes a card and the app is running in electron, the app gets updates and the card refreshed. This does not happen when app is on mobile and connected to electron.

We should verify if every message type is correctly implemented over websockets