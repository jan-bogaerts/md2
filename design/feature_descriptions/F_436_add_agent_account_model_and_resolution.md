---
author: 
id: F_436
internalId: b09a5f55-9e4f-4329-b6a7-00cec60df2e9
title: add agent account model and resolution
status: design
owner: 
affects:
agents:
policy:
branch: f_436_add_agent_account_model_and_resolution
after: 4a06c2b1-a7db-4f8f-a995-f638b14e6962
---

Introduce the shared account model used by the agent-account work in F_422. This task defines configuration and resolution only. It does not add account-management UI, login processes, or account-specific process environments.

## Current state

* Built-in Codex and Claude profiles use the desktop process environment and therefore each have one effective CLI login.
* `shared/agent_selection.mjs` stores model, thinking level, and speed settings per agent. It has no account setting.
* `desktop/src/shell/config.js` validates `desktop.agentSelection` and `desktop.agentProfiles`. The renderer mirrors those values through `config_entries.ts` and `config_service.ts`.
* Custom agent profiles do not declare which environment variable selects their provider configuration directory.

## Implementation details

* Add a validated `desktop.agentAccounts` configuration value for the supported built-in agents `codex` and `claude`. Do not infer account support for custom profiles.
* Each built-in agent always has an initial account representing the CLI login already available through the inherited environment. The initial account has a stable reserved ID, an editable name, kind `initial`, and no configured directory.
* Additional accounts have a generated UUID, an editable non-empty name, kind `directory`, and one resolved absolute `configDirectory`.
* Account IDs must be unique across the collection, account names must be unique within their agent, and normalized directory paths must be unique across directory accounts. Paths are persistence locations and never account identity.
* Treat a missing `desktop.agentAccounts` value as the two initial accounts without rewriting the stored desktop configuration. Saving account changes may persist the resolved collection normally.
* Add optional `accountId` support to `AgentSettings` and `FlatAgentSelection`. A missing account ID resolves to the selected built-in agent's initial account.
* Add shared account lookup, validation, and selection functions. An explicit unknown account, an account belonging to another agent, or an account selection on a custom profile is an error. Never replace an invalid explicit account with the initial account.
* Preserve account selection per agent when changing the active agent, following the existing `settingsByAgent` behavior.
* Do not migrate or backfill existing desktop settings. The missing-value rule is the compatibility behavior.
* Add focused shared, desktop-config, and renderer-config tests. Run the directly affected tests and lint in `app` and `desktop`.

## Acceptance criteria

* Codex and Claude each resolve an initial account when no account configuration or account ID is stored.
* Existing desktop configuration loads without being rewritten and keeps using the existing CLI login.
* Additional accounts use stable UUID identity; renaming an account or changing its directory does not change its ID.
* Explicit unknown, cross-agent, duplicate-ID, duplicate-name, and duplicate-directory values fail validation clearly.
* Custom agent profiles cannot receive an account selection.
* Selecting another agent restores that agent's remembered account selection.
* No credentials, CLI directories, conversations, schedules, activity files, or metrics are changed by this task.
