---
author: 
id: F_422
internalId: 733d678c-49a7-4409-9fa2-5fb384821513
title: check if possible to switch agent accounts
status: design
owner: 
affects:
agents:
  - design/activity/card__733d678c-49a7-4409-9fa2-5fb384821513.json
policy:
branch: f_422_check_if_possible_to_switch_agent_accounts
after: dc18bd32-58a2-4426-99ce-c79309619b03
---
we need to investigate:

* how each agent stores it's user credentials
* if we can copy the values and store them locally
* if we are able to restore user credentials for an agent.

we need to check for both codex cli and claude cli how they handle user account credentials.