---
author: 
id: B_215
internalId: 7b0ea8f9-7db3-44dd-8372-7103eca2324d
title: diagram agent popup gives invalid error
status: design
owner: 
affects:
agents:
  - design/activity/card__7b0ea8f9-7db3-44dd-8372-7103eca2324d.json
policy:
---

when opening the action popup when in diagram view, and it prepares the prompt, we get this error:

Missing cardInternalId for diagram agent conversation context

we are not working with cards, so this error should not be thrown. we have seen this error before, seems a bit of overengineering that needs simplification: only cards have internalId, so we need to stop giving errors when not on cards.