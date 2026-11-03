---
author: 
id: F_439
internalId: 1c16443d-df56-4133-997a-9a4dd0f404a1
title: add account selection to actions and runs
status: ready
owner: 
affects:
agents:
  - design/activity/card__1c16443d-df56-4133-997a-9a4dd0f404a1.json
policy:
after: 733d678c-49a7-4409-9fa2-5fb384821513
changedFiles:
  - app/src/components/actions/agent/action_agent_capability_fields.grouped.test.tsx
  - app/src/components/actions/agent/action_agent_capability_fields.tsx
  - app/src/components/actions/agent/action_agent_selectors.test.tsx
  - app/src/components/actions/agent/action_agent_selectors.tsx
  - app/src/components/actions/agent/action_prompt_owner.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
  - app/src/components/actions/run/popup/action_popup_defaults.node.test.ts
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/components/actions/run/schedule/action_schedule_owner.test.tsx
  - app/src/components/actions/run/schedule/action_schedule_owner.tsx
  - app/src/components/actions/run/sequence/card_sequence_agent_selection.tsx
  - app/src/components/actions/run/sequence/card_sequence_dialog.tsx
  - app/src/components/actions/run/sequence/card_sequence_draft_service.node.test.ts
  - app/src/components/actions/run/sequence/card_sequence_draft_service.ts
  - app/src/components/actions/shared/use_action_run_settings.ts
  - app/src/components/shell/menu/agent_menu_controls.tsx
  - app/src/components/shell/menu/app_menu.test.tsx
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_agent_selection_draft_service.ts
  - app/src/services/actions/action_definition_loader.ts
  - app/src/services/actions/action_definition_writer.node.test.ts
  - app/src/services/actions/action_definition_writer.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/actions/action_run_settings_service.node.test.ts
  - app/src/services/actions/action_run_settings_service.ts
  - app/src/services/actions/action_service_helpers.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/action/action_definition_cache.js
  - desktop/src/actions/action/action_definition_resolver.js
  - desktop/src/actions/action/action_definition_resolver.test.mjs
  - desktop/src/actions/action/action_definitions.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run_history.js
  - desktop/src/actions/action/action_run_history.test.mjs
  - desktop/src/actions/action/action_run_request.js
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/agent/agent_profiles.mjs
  - desktop/src/actions/agent/agent_profiles.test.mjs
  - desktop/src/actions/schedule/scheduled_card_sequence_engine.js
  - shared/action_definitions.d.mts
  - shared/action_definitions.mjs
  - shared/action_schedules.d.mts
  - shared/action_schedules.mjs
  - shared/agent_selection.d.mts
  - shared/agent_selection.mjs
  - shared/card_activity.d.mts
  - shared/card_activity.mjs
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

