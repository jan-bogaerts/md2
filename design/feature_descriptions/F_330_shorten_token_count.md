---
author: 
id: F_330
internalId: c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8
title: Shorten token count
status: design
owner: 
affects:
agents:
  - design/activity/card__c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8.json
policy:
after: 056265ee-3d0f-4922-8e2d-282f91bad667
---

Token count numbers can become big. We need to shorten them like 1.2K or 2M, 1.5K

Since this is shown in a lot of places, lets first make a small shared component to display this value, then use it everywhere tokencount is shown