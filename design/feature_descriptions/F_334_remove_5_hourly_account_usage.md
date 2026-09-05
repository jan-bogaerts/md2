---
author: 
id: F_334
internalId: a796a8b9-1d2c-426a-89ad-926cc55a98da
title: remove 5-hourly account usage
status: new
owner: 
affects:
agents:
policy:
after: da891103-b0c2-488f-9454-480c73c061a0
---

some agents (ex claude) report a weekly and a 5-hourly account usage. we only use the weekly account usage for stat calculation.

In some reports however, we still seem to include the 5-hourly account usage as a group. it is shown in the legend, but all values always say 'unavailable'.

we should not include this group in the legend, there should not be an 'unavailable' column on every x point