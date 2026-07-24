---
id: B-050
title: action execution still has renderer and Electron orchestrators
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 45b11a07-80f6-496a-910a-eaa2251b432c
---

## Problem

Manual and state-triggered runs still traverse `onBefore`, main, `on`, and `onAfter` in `app/src/services/action_runner.ts`. Scheduled runs traverse the same graph separately in `desktop/src/actions/scheduled_action_runner.js`. Electron bridge methods execute one agent/command action at a time.

This violates the Electron ownership boundary and permits execution paths to diverge in validation, worktree preparation, cancellation, streaming, status, and `okButNotAfter` semantics.

## Verified call sites

- Manual popup: React `ActionRunner`.
- `onState`: `AgentIntegration` delegates to React `ActionRunner`.
- Scheduled actions: `scheduled_action_runner.js` owns a second traversal.
- Bridge: separate `runAgent` and `runCommand` action methods resolve one persisted action.

All call sites must receive the new Electron behavior. No verified caller needs the old renderer orchestration.

## Fix

- Add one Electron action-runner service with a start request shaped as `{ actionId, context, runInput }`.
- Load and validate all persisted definitions in Electron before any phase starts.
- Resolve the complete ID-based graph, reject cycles, then execute all phases with one execution id and one cancellation controller.
- Use this service for manual, `onState`, scheduled, and related-action runs.
- Publish phase/action-specific events so existing UI can keep distinct logs and statuses.
- Remove renderer graph traversal and the scheduled duplicate after every call site moves. Do not add a compatibility flag.
- Keep renderer-facing bridge methods from accepting persisted prompt templates, commands, or chain definitions.

## Edge cases

- Definition changes between renderer display and run start.
- Linked action is deleted or invalid.
- Cancellation during each phase.
- Failure in each phase, including `okButNotAfter` for `onAfter` failure.
- Multiple matching `on` rules preserve configured order.
- Linked actions request different worktree/agent settings.

## acceptance criteria

- One Electron service owns lookup, validation, chaining, processes, cancellation, and status for every entry point.
- Renderer sends only action id, context, and validated run-specific input.
- Manual, `onState`, and scheduled runs produce identical phase ordering and failure results.
- `app/src/services/action_runner.ts` and duplicate scheduled traversal are removed.
- Tests cover every entry point against the same runner, rejected executable renderer input, phase failures, cancellation, and definition reload.

## see also

- [[B-029]]
- [[B-043]]
- [[F-010c]]
- `design\architecture\initial description\writings\running_actions.md`
