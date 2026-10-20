---
author: 
id: F_439
internalId: 1c16443d-df56-4133-997a-9a4dd0f404a1
title: add account selection to actions and runs
status: design
owner: 
affects:
agents:
  - design/activity/card__1c16443d-df56-4133-997a-9a4dd0f404a1.json
policy:
branch: f_439_add_account_selection_to_actions_and_runs
---

Carry optional account selection through desktop defaults, action definitions, run-menu settings, schedules, and bridge contracts. This task selects and validates account IDs but does not change spawned process environments.

## Current state

* `AgentMenuControls` edits the default agent, model, reasoning, speed, and permission settings.
* `ActionAgentCapabilityFields` edits optional action-level overrides. `ActionAgentSelectors` and `ActionRunSettingsService` own per-card/action run overrides.
* `shared/action_definitions.mjs`, action types, run input, preload/local bridge, remote control, schedule records, and action history do not carry an account ID.
* Agent selection currently resolves run overrides and action overrides before desktop defaults.

## Implementation details

* Add an account selector after the agent selector in:
  * `AgentMenuControls`, updating the selected built-in agent's optional default `accountId`.
  * `ActionAgentCapabilityFields`, updating optional action-definition `accountId`.
  * `ActionAgentSelectors`, updating the current run selection and remembered card/action settings.
* List only accounts owned by the selected built-in agent. Custom profiles do not show an account selector.
* A missing account ID means the selected agent's initial account. The UI may label this choice `Initial`; it must not write a compatibility migration merely because an old value is absent.
* If an explicit referenced account no longer exists, keep its ID as a selected unavailable option and show a validation error. Do not silently select the initial account.
* Add optional `accountId` to `ACTION_DEFINITION_FIELDS`, raw and normalized action types, editor error routing, serialization, and validation. An explicit action account requires an explicit built-in agent so ownership can be validated.
* Add optional `accountId` to run-input validation, bridge types, remote-control requests, remembered run settings, sequence/schedule agent selections, and action-definition creation.
* Resolve effective account choice in this order: run-menu account, action account, desktop default account, then the selected agent's initial account when no ID is present.
* Keep one resolution path for immediate, scheduled, chained, and remote-controlled actions. Preserve the selected ID through submission; actual account lookup and process use belong to F_440.
* Do not add account identity to provider sessions, catalogs, usage snapshots, metrics, or reset triggers in this task.
* Add focused parser/writer, validation, UI, remembered-settings, schedule/sequence, and remote-control tests. Run directly affected app and desktop tests and lint.

## Acceptance criteria

* Users can choose a default account per built-in agent, an action override, and a run-menu override.
* Selection precedence is run override, action override, desktop default, then the agent's initial account.
* Switching agents shows only accounts owned by the new agent and restores remembered settings for that agent.
* Explicit missing or cross-agent account references remain visible and block submission with a clear validation error.
* Existing actions, settings, schedules, and remote requests without `accountId` remain valid and select the initial account without rewriting stored data.
* Immediate, scheduled, chained, and remote-controlled action requests carry the same resolved account selection contract.

