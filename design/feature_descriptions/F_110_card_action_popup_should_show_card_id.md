---
author: 
id: F_110
internalId: 4b1a6636-3545-4409-bbfe-eed686514d7c
title: card-action popup should show card id
status: ready
owner: 
affects:
agents:
  - design/activity/card__4b1a6636-3545-4409-bbfe-eed686514d7c.json#conversation=agent-f450eda4-992d-4caf-b501-14ee88edcdb8
  - design/activity/card__4b1a6636-3545-4409-bbfe-eed686514d7c.json#conversation=agent-78636834-c55a-42c0-9439-ff9fd7ece6b4
policy:
after: c9f18659-b8ae-4fa1-8400-9056c028ccfd
---

currently it's rather hard to see which action-popup belongs to which card (or is for the global project agent).

so we should show the id (or 'project') somewhere in the header of the popup

## Current state

`ActionPopupContent` renders action, worktree, conversation, expand, and close controls in its header, but no target identity. Its accessible title is always `Run actions`.

Card popups keep `cardInternalId` in `ActionContext`; `ActionPopup` already subscribes to project state, where the matching card exposes its user-facing `header.id`. Project-agent popups use context kind `project`.

## implementation details

- Resolve card context to the current card's `header.id`; use `Project` for project context. Never display the internal UUID.
- Show the target at the start of the popup header as the existing compact, monospace ID-chip style. Include it in the accessible popup title.
- Keep file and folder popup behavior unchanged. Add card, project, and multiple-popup rendering tests.

## acceptance criteria

- Every card action popup visibly shows its card ID in the header.
- Project-agent popup visibly shows `Project` in the same location.
- Two open card popups show their own IDs and remain distinguishable.
- Screen readers identify the popup target.
- Existing popup controls, sizing, stacking, and action behavior remain unchanged.
