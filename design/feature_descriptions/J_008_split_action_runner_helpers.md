---
id: J-008
title: move action runner helpers to Electron
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Support [[F-010c]] by moving action orchestration helpers from React to cohesive Electron modules. No React action runner remains.

## implementation details

- Move placeholder and agent-prompt resolution to Electron; only Electron reads persisted `prompt` and `command`.
- Move action-id resolution, `on` matching, chain traversal, phase logs, execution status, and cancellation bookkeeping to Electron action-runner modules.
- Keep history persistence in its existing collaborator, but key requests and metadata by action id and execution id.
- Reuse shared action validation; do not copy model parsing into runner helpers.
- Delete React action-execution helpers after popup, state triggers, Remarkable conversion, and other verified call sites use the Electron runner.

## acceptance criteria

- React contains no action-chain runner, placeholder resolver, executable prompt builder, or output-matching implementation.
- Manual, state-triggered, and scheduled callers use Electron by action id.
- Electron helpers are unit-tested for IDs, placeholders, phases, output matching, statuses and cancellation.
- App and desktop typecheck/lint/tests pass.

## see also

- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
- `design\feature_descriptions\ready\J_013_action_runner_dependency_surface.md`
