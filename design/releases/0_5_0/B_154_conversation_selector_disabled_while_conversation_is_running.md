---
author: 
id: B_154
internalId: 8c0611fd-44e8-4f65-bc86-11c26afacc8e
title: conversation selector disabled while conversation is running
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__8c0611fd-44e8-4f65-bc86-11c26afacc8e.json
policy:
after: b7885271-1cd8-4927-9f68-661c0d87a61f
---

I don't understand why we are doing this. so first we need to investigate if there is a `functional` reason for this. if not, we should allow changing conversations on an action while the action is running. the other conversations are simply not in progress.

## Current state

There is no backend or domain restriction that prevents reading a historical conversation while another conversation for the same action is running. The selector is disabled because the renderer currently assumes that the displayed conversation is always the live conversation during an active run:

- The picker is disabled while the run is `queued`, `running`, or `waitingForInput`, and its value is forced to the live conversation path.
- Chat and usage rendering prefer the live conversation over the selected historical conversation.
- Selecting a conversation clears the action prompt draft. During an active run this would clear the active run's remembered prompt.
- Stop, Send, and Finish operate on the active run, independently of the conversation selected in the history store.

The disablement is therefore a UI consistency guard, not a functional requirement.

## Required behavior

- Keep the conversation selector enabled while a conversation is queued, running, or waiting for input.
- Continue displaying the live conversation by default. Allow the user to select and view another conversation without affecting the live run.
- Treat a selected conversation whose path differs from the live conversation path as historical browsing. Chat, conversation usage, and viewed-state acknowledgement must follow the displayed historical conversation rather than the live conversation.
- While browsing a historical conversation during an active run, Stop, Send, and Finish are unavailable. Selecting the live conversation restores the controls according to the existing run state.
- Keep the prompt editor editable while browsing history. Selecting a conversation must not clear, replace, or otherwise change the active run's prompt draft. User edits made while browsing history remain part of that same active-run draft.
- The active conversation continues receiving runtime updates while it is not displayed. Returning to it shows its current transcript and the unchanged prompt draft.

## Implementation details

- Separate the displayed conversation selection from the active run. Do not unconditionally resolve the picker, chat, or usage display to the live conversation.
- When the selected path is the live conversation path, use the live run snapshot so streaming updates remain visible instead of loading a stale persisted copy.
- Keep run routing independent from display selection. Existing active-run operations and prompt-draft binding remain scoped to the live run.
- Do not clear the prompt draft when selection changes during an active run. Preserve the existing idle behavior when selecting or clearing a conversation outside an active run.
- Derive whether the popup is browsing history from the selected and live conversation identities. Use that state both to render the three controls as unavailable and to guard their handlers.
- No desktop bridge, conversation persistence, or agent-process change is required.

## Edge cases

- Selecting the empty **Conversations** option returns the popup to its live/default display state.
- A queued run may not have a conversation yet. Historical browsing must not alter or cancel that run, and returning to the default display must remain possible.
- If the active run completes while history is displayed, the historical selection remains displayed. Subsequent controls follow the existing behavior for that selected persisted conversation.
- Viewing a historical conversation must not mark the hidden live conversation as viewed.

## Acceptance criteria

- The conversation selector remains enabled throughout queued, running, and waiting-for-input states.
- Selecting a historical conversation displays its chat and usage while the live conversation continues in the background.
- Stop, Send, and Finish cannot be invoked while a historical conversation is displayed during an active run.
- Returning to the live conversation restores its current transcript and the controls appropriate to its run state.
- Conversation selection does not change or clear the prompt. The prompt remains editable, and edits made while browsing history are still present after returning to the live conversation.
- Historical selection and viewed-state acknowledgement do not affect the hidden live conversation.
- Existing continuation, orphaned waiting-conversation, and idle historical-conversation behavior remain unchanged.

## Testing

- Cover selection of history during queued, running, and waiting-for-input states.
- Verify chat, usage, picker value, and viewed-state acknowledgement follow the displayed conversation.
- Verify Stop, Send, and Finish are unavailable and guarded while history is displayed, then recover when the live conversation is selected.
- Verify the active prompt draft is unchanged by selection, remains editable, and preserves user edits across switching away from and back to the live conversation.
- Verify live transcript updates accumulated while hidden appear when the live conversation is selected again.
