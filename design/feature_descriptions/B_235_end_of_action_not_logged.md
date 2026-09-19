---
author: 
id: B_235
internalId: 391f9465-af38-4a95-b612-52e30cada779
title: end of action not logged
status: ready
owner: 
affects:
agents:
  - design/activity/card__391f9465-af38-4a95-b612-52e30cada779.json
policy:
after: 03616c27-a15f-43f5-8ba8-523c9e9a56d1
---
We recently fixed this bug: `design/releases/0_6_0/B_233_move_agent_activity_reference_assignment_to_backend.md`

I am not certain if the new bug is related, but I think so. What happens now:

sometimes the system doesn't seem to log anymore that an action has been completed. Most often seems to occur when the action is seen as finished, when the state of the card is changed, though I also saw it happening when the agent was waiting for a response.

it's very weird, it seems part of the interface is sort of aware that the conversation ended: I believe the buttons on the action popup (send, stop, finished) were shown correctly.
But the spinner on the action button of the card was still spinning, yet the action was waiting for input. This survives a restart, so the state is probably not correct in the json files.

so there is something still going wrong in the synchronization of the agent's state.&#x20;

lets check where the state is recalculated (react app or electron backend) and how the other side is informed of the change.

in principle, it should always be the backend that calculates the new state and informs the react side

## Analysis outcome

The root cause is split ownership of agent run status, plus end-of-action records that are not always written. The work is tracked in five cards; this card stays open as the umbrella and closes when they are all done.

Governing principle: the backend owns every persisted value and every status. A renderer may set a value optimistically when it caused the change, purely for UI latency, and must accept any differing value the backend later reports.

* [B\_236](B_236_backend_owns_agent_run_status.md) — backend owns agent run status; renderer stops recomputing it
* [B\_237](B_237_card_agent_state_follows_run_events.md) — card spinner follows live run events, not just start and close
* [B\_238](B_238_backend_detects_card_state_change.md) — backend reads the card header itself; no renderer round trip for auto-finish
* [B\_239](B_239_always_write_terminal_activity_record.md) — every run leaves a terminal record; the directly reported symptom
* [B\_241](B_241_conversation_viewed_flag_converges.md) — view state announced by the backend to every window