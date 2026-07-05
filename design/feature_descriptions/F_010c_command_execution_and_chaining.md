---
id: F-010c
title: command execution and chaining
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Run `cmd` actions through Electron with placeholders resolved from context, and orchestrate `before`, main action, `on` output matches and `after` in a deterministic order with clear logs and status. Execution/runner slice of `design\feature_descriptions\F_010_actions.md`, building on [[F-010a]] and [[F-010b]].

## Current state
[[F-010a]] exposes validated action definitions and [[F-010b]] provides entry points and a popup with a `Run` command, but `Run` has no execution backing. There is no preload bridge for running actions, no placeholder resolution and no chaining/orchestration or run logs.

## implementation details
- Add preload bridge methods to run `cmd` actions. Commands execute from preload unless a command requires main-owned Electron APIs, in which case route through main. Require Electron/local mode.
- Resolve placeholders in `text` at run time from the selected context, at minimum `rootProjectFolder` and `file`.
- Execute the chain in deterministic order: `before` sub-actions → main action → `on` condition→action matches → `after` sub-actions. `on` conditions are regular expressions matched against the action's output.
- Run `after` even when the main action fails; return errors in the action log/status rather than throwing away results.
- Enforce the circular-call check from [[F-010a]] at run time and reject cycles.
- Produce a run log/status exposing running, completed and failed states for the popup (from [[F-010b]]) to display.

## acceptance criteria
- Running a `cmd` action executes through Electron with `rootProjectFolder` and `file` placeholders resolved for the selected context.
- The popup reports running, completed and failed states clearly from the run log/status.
- `before`, `after` and `on` chains run in the specified deterministic order and reject circular references.
- `after` runs even when the main action fails, and failures are reported clearly in the log/status.
- `on` regular-expression matches on output trigger their paired actions.
- Tests cover placeholder resolution, chain ordering, `after`-on-failure, `on` matching and circular-call rejection at run time.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\desktop app.md`
- `design\architecture\initial description\data management.md`
