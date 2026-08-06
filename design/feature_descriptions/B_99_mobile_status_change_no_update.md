---
author: 
id: B_99
internalId: 63ee96f0-2707-4a40-80df-dab5b0efda35
title: Mobile status change no update
status: new
owner: 
affects:
agents:
  - design/activity/card__63ee96f0-2707-4a40-80df-dab5b0efda35.json#conversation=agent-93fc4ca8-571c-43d7-b26b-6344375dc02c
policy:
---

When connected through a websocket, when the backend changes the state of a card, the react side is not notified. A reload is currently needed. Most likely a missing message