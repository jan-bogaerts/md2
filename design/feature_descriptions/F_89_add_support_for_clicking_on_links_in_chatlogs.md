---
author: 
id: F_89
internalId: 9ef42f8e-d6f7-4514-8e4a-5555318c4b51
title: add support for clicking on links in chatlogs
status: design
owner: 
affects:
agents:
  - design/activity/card__9ef42f8e-d6f7-4514-8e4a-5555318c4b51.json#conversation=agent-8f29aec9-2a25-4b34-901d-7e1888b7c54c
policy:
after: 
---
Sometimes the agent produces a link to a local project file. Currently, when the user clicks on this link, the system crashes.

What should happen: if it is a md file or action-json file in the design folder (or subfolder), show it in the list view with the correct editor. Otherwise, open it with vscode (externally)