---
author: 
id: B_248
internalId: bf77e6ca-2917-4aff-804c-81ff1cdcab6b
title: new codex model is producing unknown agent events
status: design
owner: 
affects:
agents:
policy:
---
codex agent app was updated, it seems the messaging has been changed, perhaps also a couple of things got broken during refactoring:

* project agent does not show the context usage indicator, not tokens. it only shows the time it was running.
* while the agent is running, it does not show anything in the log. only at the end, it seems, it all comes through, with a lot of 'unknown agent events, which seem to be file edits or something.