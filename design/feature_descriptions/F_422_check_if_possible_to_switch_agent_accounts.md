---
author: 
id: F_422
internalId: 733d678c-49a7-4409-9fa2-5fb384821513
title: check if possible to switch agent accounts
status: design
owner: 
affects:
agents:
policy:
---
we need to investigate:

* how each agent stores it's user credentials
* if we can copy the values and store them locally
* if we are able to restore user credentials for an agent.

we need to check for both codex cli and claude cli how they handle user account credentials.