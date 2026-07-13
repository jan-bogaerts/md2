---
id: F-010c
title: Electron action execution and chaining
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Move the complete action runner to Electron. Electron resolves a persisted action by stable id, prepares its worktree when requested, executes command or agent actions, orchestrates `onBefore`/main/`on`/`onAfter`, streams phase-specific events, and supports cancellation.

## Current state

React currently owns the manual/state-triggered `ActionRunner`, chain traversal, output matching, status aggregation, and history callbacks. It asks Electron to execute individual command or agent phases by action name. Electron has a separate chain implementation for scheduled actions. The two paths can diverge.

## implementation details

- Add one Electron `ActionRunner` used by manual, `onState`, scheduled, and related-action runs.
- The renderer-facing start method accepts only `{ actionId, context, runInput }` and returns an execution id. It does not accept `command`, `prompt`, definitions, or linked actions.
- Electron loads action files through the shared validator, resolves the persisted action and every link by `id`, and rejects unknown or invalid definitions before starting.
- Resolve `rootProjectFolder`, `file`, and supported run-input placeholders in Electron.
- Execute command actions in Electron and treat process-start errors or non-zero exits as failure.
- Delegate agent-process lifecycle to the Electron agent runner while retaining chain ownership in the Electron action runner.
- Execute `onBefore` in order, then main, then ordered matching `on` rules, then `onAfter`.
- Evaluate each `on.condition` as a regular expression against main output and execute its `actionId` when it matches.
- Stop the chain on the first failure. `onBefore` failure prevents main. Main failure prevents `on` and `onAfter`. A matched-`on` failure prevents remaining `on` and all `onAfter`. `onAfter` starts only after main and every matched `on` succeed; its failure stops later `onAfter`, fails that linked action, and finishes the selected run as `okButNotAfter`.
- Emit execution events containing execution id, root action id, current action id, phase, status, and output/error data so all UI surfaces and the global running indicator consume one stream.
- Keep execution states separate from schedule states. Execution uses `running`, `completed`, `failed`, `cancelled`, and `okButNotAfter`.
- Add an Electron cancellation method by execution id. It stops the active command or agent process, prevents remaining chain phases from starting, emits `cancelled`, and performs normal completion cleanup.
- If the definition has `needsWorkTree`, prepare it before chain execution as specified by `running_actions.md`. Do not perform implicit commit, push, merge, cherry-pick, or change transfer.
- Remove the React `ActionRunner` and the separate scheduled chain runner after every caller uses the Electron runner.

## acceptance criteria

- Manual, state-triggered, scheduled, and related-action runs share one Electron action runner.
- Renaming an action does not break execution or any linked action.
- No renderer bridge method accepts a raw command, prompt template, or resolved action definition.
- Command and agent placeholders are resolved in Electron from the persisted definition and context.
- Chain order, output matching, cycle rejection, and failure results follow this specification.
- Every event identifies the root action, current linked action, phase, and execution status.
- Cancelling a run stops its active process, starts no later phase, clears the card's current action, and reports `cancelled`.
- Tests cover ID lookup, renderer-input rejection, placeholders, all chain phases, each failure result, cancellation during command and agent phases, and reuse by the scheduler.

## see also

- `design\architecture\initial description\writings\Running actions\running_actions.md`
- `design\architecture\initial description\desktop app.md`
- `design\feature_descriptions\ready\F_010a_action_model_and_loading.md`
- `design\feature_descriptions\ready\F_022_scheduled_actions.md`
