---
author: 
id: B_90
internalId: ed76ce11-bea8-4942-aba9-2180b019f5f2
title: custom-prompt is waitingForInput with not stop option
status: new
owner: 
affects:
agents:
policy:
after: 9df160a1-c669-422b-aea5-da5655c12134
---
We had a card where the 'custom prompt' action had a conversation that was in the state 'waitingForInput', but no 'stop' or 'ready' buttons are available to mark the conversation as done.

Note: the application had stopped and restarted, so the agent itself was no longer running and everything was loaded from log

After sending new input to the agent, 'stop' and 'finish' buttons appear again.

This has been seen on regular action for cards as well: when the app is restarted, the 'waitingForInput' state is shown on the 'run' button on the card, but on the action-popup,&#x20;