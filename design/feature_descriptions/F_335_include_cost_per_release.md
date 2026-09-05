---
author: 
id: F_335
internalId: 22e1a692-a35c-4fe0-a4ea-70545e3e6009
title: include cost per release
status: new
owner: 
affects:
agents:
policy:
after: a796a8b9-1d2c-426a-89ad-926cc55a98da
---

we show the total token count usage in the status bar. when the user clicks on this, we show a popup with the token count divided over release versions and the current.

We should also include the cost of each release. we should pre-calculate this upon release and store so we don't need to recalculate this every time (value doesn't change anyway)