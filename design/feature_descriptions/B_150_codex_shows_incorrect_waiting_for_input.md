---
author: 
id: B_150
internalId: 168acbb7-c395-4962-9e69-96ec1fb6a594
title: codex shows incorrect waiting for input
status: design
owner: 
affects:
agents:
  - design/activity/card__168acbb7-c395-4962-9e69-96ec1fb6a594.json
policy:
---
codex appears to sometimes run sub tasks which give different json objects which don't appear to be handled correctly yet.

I think a sub agent reports that it is ready and that our parser then thinks that the entire conversation is already ready, which it isn't. but it puts the action popup in 'waitingForinput' mode.

The agent still seems to be running though, the conversation still grows. tools are still being run, but the action popup is in a wrong state.

we have blocks like 'collaboration:wait'