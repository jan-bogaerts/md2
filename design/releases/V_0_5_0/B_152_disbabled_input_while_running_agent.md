---
author: 
id: B_152
internalId: 038937d3-b99c-4dfd-b1da-76c906c5c31c
title: disbabled input while running agent
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__038937d3-b99c-4dfd-b1da-76c906c5c31c.json
policy:
after: 389dd95e-e4b1-460c-8171-db15ce961115
---
an agent was running, we sent a steering prompt while the agent was still running. first one went ok. but then, the 'send' button remained disabled after typing in some text in the input button (a recurring issue, clearly the state of the send button is still calculated incorrectly. it should be super simple: text in the input box, then enable the send button).

we also got this error after trying to send it with ctrl+enter: `Queued agent prompt is empty`\*\*\*\*  which makes me think we can't queue more then 1 prompt and aren't showing that prompts are queued.

then after closing the action popup and re opening it, the input box was just disabled. perhaps because the system thought there was still something in a queue? anyway, this is wrong behaviour.

I think the primary problem was that there was something in the queue and we were not giving any visual queue that something was in a queue (so no way to remove from queue either) and we incorrectly prevented multiple items to be queued

So, if items in queue, show those messages at bottom of chatlog, marked as queued with option to delete or edit

## Current state

A **queued prompt** is user text accepted for later delivery to active agent. `ActionPromptDraft` currently synchronizes editor text through Electron into one mutable `run.queuedMessage` slot. New text replaces that slot; backend cannot retain several prompts. Turn completion consumes at most one slot.

`ActionPopupBottomRow` shows Send only before a run or while agent waits for input. During active turn it shows Stop, and `Ctrl+Enter` uses same disabled rule. Structured questions and approvals also block Send. Chat renders only delivered conversation entries, so queued text has no visible state or edit/delete controls.

Because draft synchronization and sending are separate asynchronous writes to same slot, Send can read cleared or superseded content and report `Queued agent prompt is empty`. Closing and reopening popup restores editor binding, but backend exposes no queue snapshot for UI recovery.

## implementation details

- Separate editable input draft from accepted queue. Desktop action run owns ordered queue entries with stable id, content, revision, and dispatch state; replace single `queuedMessage` slot and single-session revision contract.
- Add Electron and remote-control operations to append, edit, and delete queue entries. Publish granular queue events through existing action-run event path, and store stable queue snapshot in `ActionRunRegistry`.
- While live agent exists, show and enable Send when editor is ready, backend is available, and trimmed input is non-empty. Running state, existing queued items, structured question, and approval do not disable editor or queue submission. `Ctrl+Enter` follows identical rule.
- Append submitted prompt atomically, then clear input only after backend accepts entry. Failure keeps input and reports error through `dialogService`.
- Render queued entries after delivered chat entries, in FIFO order, marked `Queued`. Give each entry accessible Edit and Delete controls. Edit changes content without changing order; reject whitespace-only edit. Delete removes only selected unsent entry.
- Dispatch one entry at time. Streaming agent receives first entry when current turn permits another message; one-shot agent starts next follow-up after current process completes. Pending structured question or approval delays dispatch, but does not prevent queueing. Remaining entries wait for later turns.
- When dispatch starts, remove entry from editable queue and use existing delivered-user-message path. Queued entries remain UI-only and must not enter persisted conversation or activity history before delivery.
- Serialize enqueue, edit, delete, turn completion, and immediate dispatch so each accepted entry is delivered at most once. Operation racing dispatch either updates/deletes entry before dispatch or reports that entry was already sent; it must not affect another entry.
- Keep queue in desktop run state so closing and reopening popup restores all unsent entries. Stop, Finish, failure, or terminal process exit discards remaining entries and clears queue UI.
- Extend desktop runner/action-run tests, bridge and remote-control tests, prompt-draft service tests, registry tests, popup tests, and chat rendering tests. Keep placeholder resolution on every dispatched entry.

## acceptance criteria

- During running or waiting live agent, typing non-whitespace text enables Send; clicking Send or pressing `Ctrl+Enter` appends one queued prompt and clears input after acceptance.
- User can queue several prompts. Chat bottom shows every unsent prompt once, in FIFO order, with `Queued`, Edit, and Delete controls.
- Pending question or approval does not block queue submission. Queued prompts remain unsent until pending interaction resolves.
- Editing queued prompt changes correct entry without moving it. Deleting queued prompt prevents its delivery. Empty edit is rejected without losing existing content.
- Streaming and one-shot runs dispatch queued prompts one at time in FIFO order. Each accepted prompt is delivered at most once and becomes normal user chat message only when dispatched.
- Popup close/reopen restores unsent queue and editable input. Queue occupancy never disables prepared editor or prevents another prompt from being queued.
- Failed enqueue retains input. Failed edit/delete retains last accepted queue state and reports error. Dispatch race never sends wrong, deleted, stale, or duplicate prompt.
- Stop, Finish, failure, and terminal exit clear unsent queue. Existing initial prompt, delivered transcript, placeholder resolution, agent settings, and action-chain finalization behavior remains unchanged except finalization waits for queued follow-ups.
