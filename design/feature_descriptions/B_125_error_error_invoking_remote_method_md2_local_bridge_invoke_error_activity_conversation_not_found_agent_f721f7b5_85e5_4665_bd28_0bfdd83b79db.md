---
author: 
id: B_125
internalId: 6d6bf2a1-f9ac-430c-ad48-255ae837c9a0
title: Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Activity conversation not found: agent-f721f7b5-85e5-4665-bd28-0bfdd83b79db
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__6d6bf2a1-f9ac-430c-ad48-255ae837c9a0.json#conversation=agent-86b031c9-95f2-4a94-9bb6-fde76003a763
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 140879683
sentryOrganization: elastetic
---
# Goal

## Current state

Before a new card agent starts, `runElectronAction` reserves a conversation ID, adds its activity reference to the card, flushes that card change, then starts the action. `ActionRunnerService.reserveConversation` creates the activity file but does not insert the conversation. The conversation first enters that file at an agent checkpoint or terminal write.

The flushed card reference triggers project-watch reloads in every connected renderer. During the interval before conversation persistence, `AgentIntegration` follows the reference and `loadActivityConversation` calls strict `findActivityConversation`. The lookup throws `Activity conversation not found`; Electron wraps that rejection as `Error invoking remote method 'md2-local-bridge:invoke'`. A browser connected through WebSocket reaches the same local dispatch and can receive the unwrapped error. This is a valid transient reservation, not corrupt activity data.

## implementation details

- Define a **pending conversation reference** as a reserved reference whose conversation is not persisted yet, including an unconsumed reservation and its active action run.
- Let `ActionRunnerService` report whether a reference is pending. Check both reservation storage and active runs so the check remains valid after `startAction` consumes the reservation.
- Keep activity loading strict. In local bridge dispatch, try the normal load first; only when that load reports the referenced conversation missing and `ActionRunnerService` confirms the reference is pending, return `null`. Re-throw malformed-file, I/O, unknown-reference, and unreserved missing-conversation errors. Remote WebSocket requests use this same dispatch, so no separate remote fallback belongs in `RemoteControlStorageService`.
- Update bridge and `StorageService` types to allow `AgentConversation | null` for this pending result. During project/background loading, `AgentIntegration` must skip `null` without adding a conversation error, warning dialog, or telemetry event. A terminal-event load must still treat `null` as an error because terminal persistence completes before that event.
- Preserve existing ordering: reserve and link reference, flush renderer changes, then start action. Do not create a placeholder conversation, change activity schema, delay project watchers, or weaken `findActivityConversation` for normal reads.
- Add focused tests for pending detection before and after reservation consumption, local and WebSocket callers sharing dispatch behavior, `AgentIntegration` skipping only pending `null`, terminal loading rejecting `null`, and an unreserved dangling reference retaining current error behavior.

## acceptance criteria

- While a reserved card conversation has no persisted record, project reloads in Electron and a connected browser produce no `Activity conversation not found` rejection, Sentry event, warning dialog, or conversation-load error.
- Both clients continue receiving live conversation state through action-run events; pending-reference handling does not create a stored placeholder or duplicate conversation.
- After first checkpoint or terminal persistence, the same reference loads and attaches the persisted conversation normally.
- Missing conversations without a matching reservation or active run still fail with `Activity conversation not found`, and malformed activity files still fail with their existing validation error.
- Conversation reservation/link/flush/start ordering, activity-file schema, strict normal reads, and terminal persistence behavior remain unchanged.

## Sentry issue

**Title:** Error: Error invoking remote method 'md2-local-bridge:invoke': Error: Activity conversation not found: agent-f721f7b5-85e5-4665-bd28-0bfdd83b79db

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/140879683/)

**First seen:** 2026-08-15T17:59:28Z

**Last seen:** 2026-08-15T18:03:09Z

**Occurrences:** 3

**Release:** Not provided

**Environment:** production

**Culprit:** file:///C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/index.html

**Event ID:** 3e9a2524e9334246a4c2de5ff6d05e82

### Application stack frames

* No application stack frames provided.



note: occurred in electron-react while another web browser was connected through websocket and change occured in web browser that triggered update in electron-react
