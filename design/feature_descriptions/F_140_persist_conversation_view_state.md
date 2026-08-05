---
author:
id: F_140
internalId: 7b158d24-318d-4081-934b-b9255a0672dc
title: persist conversation view state
status: ready
owner:
affects:
agents:
  - design/activity/card__7b158d24-318d-4081-934b-b9255a0672dc.json#conversation=agent-7ac5d9a0-7085-44e0-b48c-7b7c13458659
  - design/activity/card__7b158d24-318d-4081-934b-b9255a0672dc.json#conversation=agent-6587773b-6f50-4575-88ff-a15c2a189fe4
policy:
after: 
---

## Problem

Conversation acknowledgements are stored in browser local storage as one timestamp per project and card. The state actually belongs to an individual card action conversation and should travel with its conversation log.

Updating this state must remain independent from card state updates so one acknowledgement does not re-render the entire card.

## Requested changes

- Store `viewed` on every conversation in activity JSON. Existing conversations without the field are read as `viewed: true`; a present non-boolean value is invalid. New conversations start viewed, and continuing a conversation preserves its current value. Runtime acknowledgement behavior remains card-only.
- Set a card conversation to not viewed only when its action transitions to `waitingForInput`, `completed`, or `failed`, unless its chat is currently visible. `queued`, `running`, `cancelled`, and `okButNotAfter` do not make a conversation unseen. Ignore transitions without a conversation.
- A chat is visible only when its popup is open, its action is selected, its conversation is displayed, and that popup has the highest `stackPosition` among the entries in `CardActionPopupService`.
- Move the list-editor card conversation popup into `CardActionPopupService` so all card conversation popups use the same visibility and stacking rules. Project, folder, and search popups remain outside the service and do not participate in card acknowledgement state.
- Set an unseen conversation to viewed as soon as that chat becomes visible.
- Keep acknowledgement updates as a separate card/action-scoped event. `CardRunButton` and popup leaves subscribe directly; do not refresh or republish the `ProjectCard`.
- Scope runtime acknowledgement state by `cardPath` and `actionId`. Do not persist or pass a project key: only one project is loaded and events cannot cross projects.
- Remove local-storage acknowledgements, timestamp checkpoints, and card-path rename migration.
- Persist view changes through the existing serialized activity-file writer without creating a dedicated Git commit. A later normal activity commit includes the change.
- Preserve the currently stored `viewed` value when transcript checkpoints or terminal writes replace a conversation. Resolve this value inside the serialized file update so a stale run snapshot cannot overwrite a newer view change.

## Behavior

- Becoming covered by another popup does not make a conversation unseen. Only a later relevant action-state transition can do that.
- If the relevant conversation is already displayed in the topmost matching popup when its action changes state, it remains viewed and no unseen indicator is shown.
- Opening, selecting, or bringing forward a popup marks its displayed unseen conversation viewed once all visibility conditions are true.
- A failed conversation load leaves the conversation unseen because it was not displayed.
- View state is independent per conversation. Viewing the newest unseen conversation does not acknowledge older unseen conversations for the same action. The action remains unseen while any of its conversations are unseen, and automatic selection chooses the newest unseen conversation.
- Runtime view state is cleared when the loaded project changes. Project identity is not part of acknowledgement keys, events, or persistence requests.

## Implementation details

### Conversation contract

- Add required runtime field `viewed: boolean` to `AgentConversation`.
- Normalize a missing persisted field to `true` in the shared conversation parser. This applies consistently to card and project activity records, although only card conversations use acknowledgement behavior.
- Write `viewed: true` when creating a new conversation. Preserve the parsed value when continuing an existing conversation.

### Activity persistence

- Add one backend operation that updates `viewed` for the conversation identified by its activity reference. The persistence request does not include a project key, card path, or action ID.
- Run the read, targeted update, and atomic file write through the existing per-activity-file queue. Return the updated parsed conversation.
- When upserting a transcript checkpoint or terminal conversation, preserve `viewed` from the conversation currently in the activity file. Use the incoming value only when inserting a conversation that is not stored yet.
- Persist a checkpoint before publishing approval-driven `waitingForInput`. Question and ordinary waiting paths already persist before publishing; approval waiting must follow the same ordering so the view update can find the conversation.
- Expose the view update through the local Electron action bridge and remote-control action bridge, including preload and dispatch allowlists.

### Runtime acknowledgement service

- Replace local-storage timestamp checkpoints with transient state grouped as `cardPath -> actionId -> conversationId`.
- Subscribe to action-run events and process actual transitions into `waitingForInput`, `completed`, or `failed`. Repeated events carrying the same status must not cause repeated writes.
- Keep the live conversation in runtime acknowledgement state when the `ProjectCard` snapshot does not contain it yet. Queries combine card conversations with newer runtime state.
- Publish a card/action-scoped acknowledgement event after a runtime value changes. Popup leaves subscribe to their exact `cardPath` and `actionId`; `CardRunButton` subscribes to the affected card aggregate because it represents all actions on that card.
- Do not call card snapshot refresh, `updateAgentConversation`, or any other path that republishes the `ProjectCard` for a view-only change.
- Remove the acknowledgement call from card-path rename handling. Persisted conversation references already retain the state across a card rename.

### Popup visibility

- Pass the stable `CardActionPopupService` entry ID to the card popup chat boundary. Do not copy stack positions into acknowledgement state because positions change when entries open, close, or activate.
- The mounted chat boundary establishes that the popup is open, the action is selected, and a conversation is displayed. It counts as visible only when its entry ID is also the final/topmost service entry.
- Re-evaluate visibility when the displayed conversation, selected action, popup membership, or popup stack order changes.
- When a covering popup closes, the newly exposed matching chat becomes visible and acknowledges its displayed conversation. Merely covering a chat does not modify its state.

### Failure and concurrency behavior

- Apply view changes optimistically so acknowledgement subscribers update immediately.
- Report persistence failures through `dialogService`, restore the previous runtime value, and allow the next qualifying state or visibility change to retry.
- Track the latest desired value per conversation. A failed older request must not roll back a newer request.
- Rely on the backend activity-file queue for disk-write ordering; do not add a second independent persistence path.

## Acceptance criteria

- View state is stored per conversation in its card activity JSON.
- Existing conversation files without `viewed` load as viewed; invalid explicit values fail parsing.
- A result produced behind a closed, lower, or differently selected popup is marked unseen.
- A result shown in the topmost matching popup remains viewed.
- Bringing the matching popup to the front marks its displayed unseen conversation viewed.
- Closing a covering popup marks the displayed unseen conversation in the newly topmost matching popup viewed.
- Viewing one unseen conversation does not mark other unseen conversations viewed.
- Failed conversation loading or failed view persistence leaves the conversation unseen and retryable.
- Only acknowledgement subscribers for the affected card/action update; the card itself is not refreshed.
- Later transcript persistence cannot overwrite a newer view state.
- View changes update the activity file without creating a dedicated Git commit.
- Runtime acknowledgement state cannot carry into a subsequently loaded project.

## Testing

- Shared parsing: missing, explicit true, explicit false, and invalid `viewed` values.
- Conversation creation and continuation: new conversations start viewed and continued conversations preserve their value.
- Activity persistence: targeted updates affect only one conversation; checkpoint and terminal replacements preserve the latest stored value under queued-write races.
- Waiting transitions: question, approval, and ordinary waiting states have a persisted conversation before an unseen update runs.
- Visibility: closed, lower, differently selected, failed-load, already topmost, activated, and newly exposed popup cases.
- Multiple conversations: newest unseen selection and independent acknowledgement of older unseen conversations.
- Events: only exact card/action popup subscribers and the affected card aggregate subscriber update; no card snapshot refresh occurs.
- Failure handling: optimistic rollback, retry, and protection against an older failed request reverting newer state.
- Project lifecycle and bridges: project changes clear runtime state, and local plus remote bridges forward the targeted view update.
