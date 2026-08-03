---
author: 
id: F_109
internalId: 0f5a1edf-4b4e-4dea-8c7a-05df83ae1288
title: add access-level option for agents
status: ready
owner: 
affects:
agents:
  - design/activity/card__0f5a1edf-4b4e-4dea-8c7a-05df83ae1288.json#conversation=agent-61257114-41c8-4311-a5e7-8d8d4e79471d
policy:
after: 0b35236a-2fe4-4b58-86f8-bd84af5ac7ce
---
## Current state

MD² selects agent, model, and thinking level globally, per action, and per run. Agent profiles define model choices and command arguments. Access level and approval policy are not represented in profiles, action definitions, run requests, or UI controls.

Agent commands therefore omit both settings. Codex and Claude use provider defaults or user configuration, so MD² cannot show, validate, or audit effective permissions.

## Implementation details

- Add provider-specific access-level and approval-policy choices, argument names, and defaults to each agent profile. Keep provider wording unchanged; built-in Codex choices use `read-only`, `workspace-write`, and `danger-full-access`, plus `untrusted`, `on-request`, and `never`.
- Add `desktop.accessLevel` and `desktop.approvalPolicy` defaults. Add optional `accessLevel` and `approvalPolicy` overrides to agent action definitions and run input. Resolution order is run override, action override, then desktop default.
- Show profile-supported choices beside agent, model, and thinking level in config, action editor, and local run/chat controls. Changing agent resets incompatible selections to that profile's defaults. Clearly report profiles that do not expose either capability.
- Validate profile definitions, saved actions, renderer requests, and Electron execution. Reject unknown values, missing argument mappings, or values unsupported by selected agent before process start.
- Add resolved arguments before one-shot, resume, and streaming subcommands. For built-in Codex, use `--sandbox <accessLevel>` and `--ask-for-approval <approvalPolicy>`; other profiles use their configured arguments without MD² translating provider terms.
- Propagate effective values through scheduled, chained, continued, local-bridge, and remote-control runs. Record them in execution events and action history.
- Add profile, config persistence, action validation/editor, popup/controller, request-contract, command-building, execution, bridge, remote-control, continuation, and scheduling tests.

## Acceptance criteria

- Each agent exposes only its configured access levels and approval policies, using provider-specific names.
- User can set global defaults, action overrides, and local run/chat overrides for both settings.
- Run override wins over action override; action override wins over desktop default.
- Codex receives exact resolved `--sandbox` and `--ask-for-approval` values for one-shot, resumed, and streaming runs.
- Unsupported, stale, or malformed selections fail before process start with a clear error.
- Switching agents cannot retain incompatible access or approval selections.
- Scheduled, chained, continued, local, and remote runs use and report effective settings consistently.
- Existing agent/model/thinking-level behavior, approval handling, and execution tests remain valid.
