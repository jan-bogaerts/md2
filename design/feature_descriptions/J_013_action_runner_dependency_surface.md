---
id: J-013
title: define Electron ActionRunner dependency surface
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Current React `ActionRunner` injects bridge, project, history, agent callbacks, command execution, and configuration. Scheduled Electron execution has a different dependency set. Moving to one Electron runner needs one explicit dependency boundary, not two runner-shaped service graphs.

## Fix

- Define cohesive Electron collaborators:
  - action repository: load and validate persisted definitions by id;
  - process gateway: command and agent start/input/cancel;
  - execution recorder: events, history, conversation links and terminal cleanup;
  - action environment: project, actions folder, supported agent configuration and worktree preparation.
- Inject collaborators into the Electron `ActionRunner` as one dependencies object.
- Scheduler, bridge dispatch, and state-trigger entry points call the same runner; they do not inject phase-level behavior.
- Remove React runner dependencies and legacy compatibility shims.

## acceptance criteria

- Exactly one production ActionRunner exists, in Electron.
- Constructor accepts one small dependencies object of cohesive collaborators.
- Manual, state-triggered, and scheduled runs use identical dependencies and behavior.
- No synthetic profile or legacy action-shape fallback remains.
- Tests replace collaborators, not individual internal functions.

## see also

- `design\feature_descriptions\ready\F_010c_command_execution_and_chaining.md`
- `design\feature_descriptions\ready\J_008_split_action_runner_helpers.md`
