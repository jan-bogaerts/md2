---
author: 
id: F_251
internalId: 67aa408b-6038-40b7-a82d-76678ca7b201
title: action popup height and location
status: new
owner: 
affects:
agents:
policy:
---

when the height of the action popup wants to be bigger than the height of the app, it sort of shows up as max height, but the popup tries to leave some room at the bottom of the popup and perhaps also a little bit at the top.&#x20;

At the bottom, we don't need to do this, it can be at the edge of the bottom (not below), but it should remain a little more below the edge at the top, cause the close button in the upper right corner of the action popup can no longer be clicked on when it is behind the drag area of the main window (to move the window around), which is annoying.