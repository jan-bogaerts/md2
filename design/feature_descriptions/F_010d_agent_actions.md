---
id: F-010d
title: agent actions
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Run `agent` actions through the configured agent command/prompt flow, with an extra-prompt input dialog before running, run history for the same action/context, and a `convert to action` path for custom prompt input. Agent slice of `design\feature_descriptions\F_010_actions.md`, building on [[F-010c]].

## Current state
[[F-010c]] runs `cmd` actions and orchestrates chaining/logs, but the `agent` action type is not wired to execution. The popup ([[F-010b]]) has no extra-prompt input, no run history and no `convert to action`. Agent process execution and conversation logs are owned by the desktop app and agent feature ([[F-013]], [[F-012]]).

## implementation details
- Start the configured agent command/prompt flow for `agent` actions through the preload bridge, reusing the chaining/log orchestration from [[F-010c]].
- In the agent popup, show an input dialog for extra prompt text before running; combine it with the action `text` and resolved placeholders.
- When the action was previously triggered for the selected context, show its run history in the popup. Coordinate the conversation/log source of truth with [[F-012]].
- When the user enters custom prompt input, offer `convert to action` to store it as a reusable action definition in the actions folder (validated per [[F-010a]]).

## acceptance criteria
- `agent` actions run through the configured agent flow with extra prompt input and resolved placeholders.
- The agent popup shows previous run history for the same action/context when available.
- Entering custom prompt input exposes a `convert to action` path that writes a valid reusable action definition.
- Agent actions participate in the `before`/`after`/`on` chaining and log/status behavior from [[F-010c]].
- Tests cover extra-prompt input, run-history display, `convert to action` output and agent-action chaining.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\action_popup.md`
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
