---
id: F-010
title: actions
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

> **Split for implementation.** Implement the ordered sub-features instead of this umbrella feature.
> - [[F-010a]] action model and loading - stable ids, model, loader, validation, circular-call check, service and hook
> - [[F-010b]] action entry points and popup - `appliesTo`, entry points, popup, run/cancel controls, related-action links
> - [[F-010c]] Electron action execution and chaining - Electron runner, placeholders, `onBefore`/main/`on`/`onAfter`, logs and status
> - [[F-010d]] agent actions - agent flow, extra prompt, conversation input, run history and `convert to action`
> - [[F-010e]] state triggers and folder watching - `onState`, card current-action state and hot reload
>
> Dependency order is a -> b -> c -> d/e. D and E both build on C.

## Goal

Load ID-based JSON action definitions from the project's actions folder, show context-sensitive action entry points, and execute actions only through an Electron-side action runner. Support agent and command actions, the built-in custom-prompt action, placeholders, `onBefore`/`on`/`onAfter` chaining, `onState`, `needsWorkTree`, cancellation, and `appliesTo`.

## Current state

The existing implementation uses a React-side `ActionRunner`, name-based action lookup, `agent | cmd`, `text`, `before`/`after`, inline/by-name references, and a separate Electron scheduled-action runner. The implementation must move orchestration to Electron and migrate to the canonical model below without legacy-shape fallback.

## implementation details

- Define actions with required stable `id`, editable `name`, `label`, `description`, and `type` (`agent` | `command`). Agent actions require `prompt`; command actions require `command`.
- Add optional `icon`, `appliesTo`, `onBefore`, `on`, `onAfter`, `onState`, `needsWorkTree`, `agent`, `model`, and `thinkingLevel`.
- Persist `onBefore` and `onAfter` as ordered action `id` lists. Persist `on` as ordered `{ condition, actionId }` entries. Do not support inline linked definitions or name-based references.
- Register a built-in `custom prompt` agent action with its own stable reserved `id`, independent of project files.
- Load actions when a project opens. Fail fast on invalid JSON, missing fields, duplicate ids, unknown action ids, invalid regular expressions, or circular calls.
- Keep the loaded definitions in the action service for editing, display, filtering, and search. React does not orchestrate or execute them.
- Show compact entry points near matching cards, files, and folders based on `appliesTo`.
- Open a resizable popup for the selected action id and context. Show `Run`, `Cancel` while running, and a `Schedule` entry point that delegates to [[F-022]].
- For agent actions, show extra prompt input and the supported per-run agent/model/thinking-level choices. Model choices come from configured profiles with built-in defaults; thinking choices are `none`, `low`, `medium`, `high`, and `max`.
- The renderer sends only `{ actionId, context, runInput }`. Electron reloads and validates the persisted definition by `id`, resolves placeholders, and executes the complete chain.
- Execute `onBefore` -> main -> matching `on` actions -> `onAfter` in configured order. Reject cycles before execution.
- Stop the chain on the first failure. `onBefore` failure prevents main. Main failure prevents `on` and `onAfter`. A matched-`on` failure prevents remaining `on` and all `onAfter`. `onAfter` starts only after main and every matched `on` succeed; its failure stops later `onAfter`, fails that linked action, and finishes the selected run as `okButNotAfter`.
- `Cancel` stops the active Electron process and remaining chain and marks the run cancelled.
- When `needsWorkTree` is set, Electron requires card context and resolves the card's valid assignment from the configured worktree list. It does not create a worktree or automatically commit, push, merge, cherry-pick, or transfer changes.
- A card keeps its current action in memory. While set, all action entry points for that card are disabled. Completion, failure, or cancellation clears it and publishes an event; it is never persisted.
- Trigger `onState` actions through the same Electron runner.
- Watch the actions folder in local Electron mode and publish validated definition changes to React.

## acceptance criteria

- Opening a project loads valid ID-based action JSON and exposes it to React.
- Legacy `cmd`/`text`/`before`/`after`/name-reference and inline-reference shapes are rejected rather than normalized.
- Invalid definitions report the source and do not replace the previous valid action set.
- Actions appear only in contexts matching `appliesTo`; the built-in custom-prompt action remains available in supported contexts.
- Activating an entry point opens a resizable popup bound to the action id and context.
- React cannot execute or orchestrate an action. Manual, state-triggered, and scheduled runs use the same Electron-side action runner.
- Command and agent definitions are resolved by id in Electron; renaming an action does not break links, schedules, or execution.
- `onBefore`, main, `on`, and `onAfter` ordering and failure results follow this specification.
- A running action can be cancelled and reports running, completed, failed, cancelled, or `okButNotAfter` clearly.
- A card with a current action disables every action entry point until Electron reports a terminal state.
- `needsWorkTree` uses a valid card-assigned worktree, rejects missing or invalid assignments and non-card contexts, and performs no implicit creation or integration operations.
- Adding, editing, or removing local definitions updates the UI without restarting.

## see also

- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\action_popup.md`
- `design\architecture\initial description\writings\running_actions.md`
- `design\architecture\initial description\writings\action_editor.md`
- `design\feature_descriptions\ready\F_022_scheduled_actions.md`
