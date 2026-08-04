---
author:
id: F_140
internalId: 7b158d24-318d-4081-934b-b9255a0672dc
title: persist conversation view state
status: ready for implementation
owner:
affects:
agents:
policy:
after: 
---

## Problem

Conversation acknowledgements are stored in browser local storage as one timestamp per project and card. The state actually belongs to an individual card action conversation and should travel with its conversation log.

Updating this state must remain independent from card state updates so one acknowledgement does not re-render the entire card.

## Requested changes

- Store `viewed` on every conversation in the card activity JSON. Existing conversations without the field are read as `viewed: true`; new conversations also start viewed.
- Set a conversation to not viewed when its action reaches a user-relevant state such as `waitingForInput`, `completed`, or `failed`, unless its chat is currently visible.
- A chat is visible only when its popup is open, its action is selected, its conversation is displayed, and that popup has the highest `stackPosition` among the entries in `CardActionPopupService`.
- Set an unseen conversation to viewed as soon as that chat becomes visible.
- Keep acknowledgement updates as a separate card/action-scoped event. `CardRunButton` and popup leaves subscribe directly; do not refresh or republish the `ProjectCard`.
- Scope runtime acknowledgement state by `cardPath` and `actionId`. Do not persist or pass a project key: only one project is loaded and events cannot cross projects.
- Remove local-storage acknowledgements, timestamp checkpoints, and card-path rename migration.
- Persist view changes through the existing serialized activity-file writer and preserve `viewed` when transcript checkpoints or terminal writes replace a conversation.

## Acceptance criteria

- View state is stored per conversation in its card activity JSON.
- A result produced behind a closed, lower, or differently selected popup is marked unseen.
- A result shown in the topmost matching popup remains viewed.
- Bringing the matching popup to the front marks its displayed unseen conversation viewed.
- Only acknowledgement subscribers for the affected card/action update; the card itself is not refreshed.
- Existing conversation files load as viewed.
- Later transcript persistence cannot overwrite a newer view state.
