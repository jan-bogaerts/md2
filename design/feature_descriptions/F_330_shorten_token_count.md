---
author: 
id: F_330
internalId: c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8
title: Shorten token count
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c632a2b7-9a1a-4c98-b42d-79d3c26fa0c8.json
policy:
after: 6142a098-2865-430d-9ca9-a55e0ce5feff
---

Token count numbers can become big. We need to shorten them like 1.2K or 2M, 1.5K

Since this is shown in a lot of places, lets first make a small shared component to display this value, then use it everywhere tokencount is shown