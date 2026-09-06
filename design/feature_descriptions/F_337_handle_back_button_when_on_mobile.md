---
author: 
id: F_337
internalId: 78a34547-ca4b-47ac-97cf-78b33da210e9
title: Handle back button when on mobile
status: new
owner: 
affects:
agents:
policy:
after: c6100c77-b4ed-44ab-b53d-7770c01b8656
---

When the app is on a small screen and running in a browser, so not in electron. And a popup is open, which will be full screen in this situation, then the browser´s back button should close the popup.