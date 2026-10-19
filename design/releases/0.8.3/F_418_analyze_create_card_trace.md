---
author: 
id: F_418
internalId: 9b65ede2-ebc4-46b2-9e0e-49ea8ee9f6f2
title: analyze create card trace
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__9b65ede2-ebc4-46b2-9e0e-49ea8ee9f6f2.json
policy:
after: bc03f0a4-0b04-4e1e-bbc1-f8b6ae264c4c
changedFiles:
  - app/src/services/data/card_operations.test.ts
  - app/src/services/data/card_operations.ts
---

When creating a new card, after clickin on 'add' it still takes a relatively long time before the popup closes. too long compared to what actually should happen.

here is the performance trace of the application. analyze what is happening while adding a new card

[Trace-create card.json](file:///C:/Users/janbo/Documents/dev/Trace-create%20card.json)