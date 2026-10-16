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
---
we need to investigate:

* how each agent stores it's user credentials
* if we can copy the values and store them locally
* if we are able to restore user credentials for an agent.

we need to check for both codex cli and claude cli how they handle user account credentials.









ok, update {{this-card}} so things are ready to be implemnted.

* sessions should have the option to remember account. if not specified, use default
* each agent should have the 'default' account, add account creates a new configuration directory (use can select the location of the folder). when folder created, cli is started so user can log in.
* the default account should be the 'global' account, used when no configuration folder is specified.
* on the action and on the run menu, like we can select agent, model, reasoning level,... also allow to select account.
* when user switches account on a conversation, it is similar like switching agent, we send the entire conversation log the first time.