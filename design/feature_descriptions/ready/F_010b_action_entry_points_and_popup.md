---
id: F-010b
title: action entry points and popup
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Show context-sensitive action entry points near the matching card/file/folder based on `appliesTo`, and open a resizable action popup that is the execution surface for the selected action and context, with a `Run` command and shortcuts to `before`/`after` actions. UI slice of `design\feature_descriptions\F_010_actions.md`, building on [[F-010a]].

## Current state
[[F-010a]] loads and validates action definitions and exposes them to React through a hook, but nothing displays or runs them. There is no `appliesTo` filtering, no action entry-point UI on cards/files/folders, and no action popup. `Run` has no execution backing yet — that arrives with [[F-010c]].

## implementation details
- Evaluate `appliesTo` against the selected context (card/file/folder, e.g. `type`, `state`) and display compact action entry points as close as possible to the matching item — icon buttons/menu items on cards, context menu on folders, local menu or toolbar on files.
- Always offer the built-in `custom prompt` action for contexts where actions can run.
- Open a popup when the user activates an entry point; the popup is bound to the selected action and context.
- Make the popup resizable, with the resize handle on the lower-left or lower-right corner depending on popup position.
- Show a `Run` command in the popup. Wire it to the execution service from [[F-010c]]; until that lands it may call a stub that reports "not yet runnable".
- Always show shortcuts to the action's `before` and `after` actions; activating a shortcut opens a new popup for that related action with the same context.

## acceptance criteria
- Action entry points appear only for contexts matching `appliesTo`, positioned close to the related card/file/folder.
- The `custom prompt` action is available in every context where actions can run.
- Activating an entry point opens a resizable popup bound to that action and context, with the handle placed by popup position.
- The popup shows a `Run` command and shortcuts to `before` and `after` actions.
- Each `before`/`after` shortcut opens a new popup for that related action with the same context.
- Tests cover `appliesTo` filtering, entry-point placement per context type, popup open/resize and shortcut navigation.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\action_popup.md`
- `design\architecture\initial description\app layout.md`
- `design\architecture\initial description\overview.md`
