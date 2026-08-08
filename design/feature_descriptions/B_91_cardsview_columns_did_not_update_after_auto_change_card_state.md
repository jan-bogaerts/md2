---
author: 
id: B_91
internalId: c0571d27-a3f8-41bd-9a3b-861c7969f9af
title: cardsview columns did not update after auto change card state
status: ready
owner: 
affects:
agents:
  - design/activity/card__c0571d27-a3f8-41bd-9a3b-861c7969f9af.json#conversation=agent-224acbad-0ba9-4967-9f6b-d3273674e8c7
  - design/activity/card__c0571d27-a3f8-41bd-9a3b-861c7969f9af.json#conversation=agent-56e11400-ba5b-46c5-99c0-89f0922aa940
  - design/activity/card__c0571d27-a3f8-41bd-9a3b-861c7969f9af.json#conversation=agent-cc1684bf-f5fc-45ce-a0c9-9582d083e63d
policy:
after: a57b89e0-49f4-4c25-9d99-deea222460cd
branch: b_91_cardsview_columns_did_not_update_after_auto_change_card_state
worktree: 3
---
an agent changed the state of a card to ready, but the UI did not get updated. the card remained in the old column, did not move to the 'ready' column.

This occured while using websockets

## Current state

Card state means `status` in card Markdown frontmatter. With an uninterrupted remote connection, Electron's project watcher sends a `watchProject` WebSocket event, `RemoteControlStorageService` loads the changed file, `ProjectLoading` reparses it, and `DataService` publishes `status` and `ordering` events. `useCardViewColumns` and `useCardColumnCards` consume those events and should move the card.

[[B-87]] added remote file loading. [[B-99]] added tests for status event publication and mobile column movement, but those tests inject a watch event and React events separately. They do not cover a socket replacement. Current reconnect code restores action-run and rate-limit subscriptions, but clears project-watch subscriptions. `ProjectLoading` still holds its cleanup function and therefore assumes watching continues. Any card file change after that loss remains absent from React state. Changes made while disconnected are also lost because watch events are not replayed. The report does not record a disconnect, so this failure mode must be confirmed against the reported sequence.

## implementation details

- Add a regression test spanning remote project load, WebSocket loss and recovery, external card `status` change, `DataService` event publication, and board column membership. Also retain coverage for an uninterrupted connection.
- Keep each project watch as a logical subscription: project plus callback owned until caller unsubscribes. Treat server-issued subscription ID as connection-specific state. On socket close, discard only connection-specific state; after reconnect, issue `watchProject` again for every live logical subscription.
- After a watch is restored, resynchronize the loaded project. Resynchronization means loading current project files again and applying differences, so edits made while disconnected are recovered even though no watch event exists for them.
- Prevent duplicate watches across repeated reconnects. Cleanup must unsubscribe current server subscription and remove logical subscription so it cannot return on a later reconnect.
- Keep existing `watchProject` protocol and granular `status` and `ordering` events. Do not add a card-status-specific WebSocket message.
- Preserve watcher debounce, app-generated commit-echo suppression, dirty-document conflict protection, and local Electron watching.

## acceptance criteria

- With an uninterrupted WebSocket connection, an agent change from old `status` to `ready` moves card from old column to `ready` column after normal watcher debounce, without reload.
- If WebSocket disconnects before or during change, reconnection restores project watch and resynchronizes project; card then moves without manual reload.
- Card content and any open status control show same reloaded file values as board.
- Each live project has exactly one server watch after any number of reconnects; closing project removes it permanently.
- Status change publishes path-scoped `status`, collection `status`, and collection `ordering` events. Unrelated card-field subscribers do not rerender.
- Dirty local card edits remain protected, and desktop/local project watching keeps existing behavior.
