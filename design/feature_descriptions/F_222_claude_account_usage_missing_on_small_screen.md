---
author: 
id: F_222
internalId: a2f851ba-744e-4b53-bc9b-33e1eaa6787a
title: Claude account usage missing on small screen
status: design
owner: 
affects:
agents:
  - design/activity/card__a2f851ba-744e-4b53-bc9b-33e1eaa6787a.json
policy:
---
first noticed while on connected through websocket to electron with using an android (small screen), claude account usage was not on the hamburger menu. But when connected over websockets using a browser, so large screen, but still remote, claude-account-usage is also missing on the status bar, yet in the electron environment (so react in electron renderer), is showing claude-account-status. so something is not transmitted over websockets perhaps?