---
author: 
id: B_87
internalId: 1b39ee56-e06e-4705-840f-7541b2a57d3d
title: Card changed not pushed to mobile
status: new
owner: 
affects:
agents:
policy:
---

When an agent changes a card and the app is running in electron, the app gets updates and the card refreshed. This does not happen when app is on mobile and connected to electron.

We should verify if every message type is correctly implemented over websockets