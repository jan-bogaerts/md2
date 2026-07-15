---
id: F-047
title: running actions and agents
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Implement the Electron-owned action execution flow defined in `design\architecture\initial description\writings\running_actions.md` so every execution surface uses one runner, one live state, and one set of chain and failure semantics.

## Current state

Implemented. One Electron-owned runner handles manual, scheduled, `onState`, related, and continuation executions. Renderer surfaces consume its shared execution events. Agent turns use configured profiles, structured one-shot processes, model/thinking selection, persisted conversations, and explicit provider-session continuation.

## Implementation details

- Treat `design\architecture\initial description\writings\running_actions.md` as the implementation contract.
- Add one Electron action runner for manual, `onState`, scheduled, related, and continuation runs.
- Accept only the action `id`, context, and run-specific input from the renderer. Load and validate executable definitions in Electron.
- Publish execution events with execution id, root action id, current action id, context, phase, status, output, and error details.
- Execute `onBefore`, main, matching `on`, and `onAfter` actions with the documented ordering, failure, `okButNotAfter`, and cancellation rules.
- Stream command output and structured agent events to shared execution state. Persist conversation output incrementally and run each agent turn in a separate process.
- Drive the popup, conversation panel, card `currentAction`, history, and global running-actions indicator from the same Electron event stream.
- Load model choices from configured agent profiles. Built-in Codex and Claude profiles provide default model lists.
- Use fixed thinking levels: `none`, `low`, `medium`, `high`, and `max`. `none` passes no thinking-level override.
- Check Codex and Claude executable availability and disable unavailable agents with a clear explanation.
- For `needsWorkTree`, require card context with a valid assignment from the configured worktree list. Do not create, register, or assign worktrees during execution.
- Remove the React action runner and separate scheduled chain runner after all callers use the Electron runner.

## Test plan

- Add Electron unit tests for id lookup, request validation, placeholders, every chain phase, output matching, failure results, events, history, and cancellation during command and agent phases.
- Add integration tests proving manual, `onState`, scheduled, related, and continuation paths delegate to the same runner.
- Add React tests for live popup state, cancel, disabled running-turn input, follow-up agent selection, card disabling, terminal cleanup, history, backend-unavailable errors, and the global indicator.
- Add capability tests for built-in/default profile models, profile overrides, fixed thinking levels, invalid selections, and unavailable executables.
- Add worktree tests for valid assignments, missing assignments, invalid configured entries, and non-card contexts.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in `app/` and `desktop/`, plus `npm run typecheck` in `app/`.

## Acceptance criteria

- Exactly one production action runner exists, and it runs in Electron.
- Manual, `onState`, scheduled, related, and continuation executions use that runner by stable action id.
- No renderer execution request contains a command, prompt template, linked definition, or other executable definition data.
- Every execution event identifies the root action, current action, context, phase, and execution status.
- Chain ordering and all documented failure results, including `okButNotAfter`, match the architecture contract.
- Cancellation stops the active process, prevents later phases, emits `cancelled`, clears card state, and removes the run from the global indicator.
- Structured agent output streams live, running-turn input is disabled, completed conversations start one-shot follow-ups, and history remains keyed by action id and context.
- The popup, conversation panel, card action state, history, and global indicator show consistent live and terminal execution state.
- Codex and Claude availability reflects executable checks; model choices come from configured profiles with built-in defaults; thinking choices are `none`, `low`, `medium`, `high`, and `max`.
- `needsWorkTree` runs only with valid card-assigned configured worktrees and rejects missing, invalid, or non-card contexts before process start.
- Web mode keeps definitions editable and disables execution controls with a clear explanation when no Electron backend is available.
- App and desktop lint, typecheck, and tests pass.

## See also

- `design\architecture\initial description\writings\running_actions.md`
- `design\feature_descriptions\ready\F_010_actions.md`
- `design\feature_descriptions\ready\F_022_scheduled_actions.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
- `design\feature_descriptions\ready\F-46-git-worktrees.md`
