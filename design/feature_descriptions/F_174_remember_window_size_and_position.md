---
author: 
id: F_174
internalId: fc4322fa-2432-4365-b355-32cf5e6e6af2
title: remember window size and position
status: new
owner: 
affects:
agents:
policy:
---

When the electron app closes, we should save the window state, position and size so we can restore the settings when the app starts the next time.

This only needs to be done for the electron app.

there should be libraries that do this already for us.