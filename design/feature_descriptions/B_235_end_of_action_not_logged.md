---
author: 
id: B_235
internalId: 391f9465-af38-4a95-b612-52e30cada779
title: end of action not logged
status: new
owner: 
affects:
agents:
policy:
---

We recently fixed this bug: `design/releases/0_6_0/B_233_move_agent_activity_reference_assignment_to_backend.md`

I am not certain if the new bug is related, but I think so. What happens now:

sometimes the system doesn't seem to log anymore that an action has been completed. Most often seems to occur when the action is seen as finished, when the state of the card is changed, though I also saw it happening when the agent was waiting for a response.

it's very weird, it seems part of the interface is sort of aware that the conversation ended: I believe the buttons on the action popup (send, stop, finished) were shown correctly.
But the spinner on the action button of the card was still spinning, yet the action was waiting for input. This survives a restart, so the state is probably not correct in the json files.

so there is something still going wrong in the synchronization of the agent's state.&#x20;

lets check where the state is recalculated (react app or electron backend) and how the other side is informed of the change.

in principle, it should always be the backend that calculates the new state and informs the react side