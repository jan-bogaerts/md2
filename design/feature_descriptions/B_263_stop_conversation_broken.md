---
author: 
id: B_263
internalId: 745316e6-c707-4233-8ca9-32228e950e3a
title: stop conversation broken
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__745316e6-c707-4233-8ca9-32228e950e3a.json
policy:
---

Stopping a conversation must keep that conversation selected instead of switching to "New conversation".

## Cause

The popup root subscribes to complete worktree records. Git status changes rebuild its assignment context, which recreates popup stores and loses conversation selection. The subscription was added to update action filters after worktree renumbering, but status changes do not require that recalculation.

## Implementation

- Remove the whole-worktree-record subscription from the popup root. Resolve assignment when the popup opens.
- Recalculate assignment numbers, action filters and validation only when MD² changes worktree configuration (adds/removes checkouts) or changes a card/project assignment. Use those existing operations as explicit triggers.
- Preserve popup stores and selected conversation during recalculation. Use canonical card/context identity and action identity for their lifetime, not assignment-context object references.
- Keep Git status subscriptions in the small worktree controls that display dirty state, commit counts and related actions. Status polling must not refresh unrelated popup components.
- Remove the automatic Git refresh/fetch triggered when the last agent stops. Existing local polling supplies status updates; final agent changes appear on the next poll.
- Do not add a snapshot cache or service layer. Worktree changes made outside MD² are out of scope.

## Verification

- Stop preserves selected conversation and transcript.
- Git status updates refresh worktree controls without recreating popup stores or refreshing unrelated components.
- MD² configuration changes still update worktree numbers, action filters and validation, including partial changes before an operation fails.
- Card/project assignment changes still update execution context without losing conversation selection.