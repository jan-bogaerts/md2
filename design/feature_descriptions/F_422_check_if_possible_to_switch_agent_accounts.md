---
author: 
id: F_422
internalId: 733d678c-49a7-4409-9fa2-5fb384821513
title: check if possible to switch agent accounts
status: ready
owner: 
affects:
agents:
  - design/activity/card__733d678c-49a7-4409-9fa2-5fb384821513.json
policy:
branch: f_422_check_if_possible_to_switch_agent_accounts
---
Allow separate Codex and Claude accounts to be configured, selected as defaults, assigned to actions and runs, and remembered by provider sessions in a conversation.

this card was split up into the following sub sections:

F_436 – account model and resolution
F_437 – account lifecycle service
F_438 – account management UI
F_439 – account selection for actions and runs
F_440 – account-aware execution
F_441 – account-scoped provider sessions
F_442 – account-scoped catalogs and runtime usage
F_443 – account-scoped metrics and reset schedules



## Current state

* MD² has one effective account per CLI. `AgentRunnerService`, model discovery, and account-usage polling copy the desktop process environment, so every Codex process uses the same Codex login and every Claude process uses the same Claude login.
* The existing global logins are the initial primary accounts:
  * Codex uses its normal `CODEX_HOME` (default `%USERPROFILE%\.codex`). File-based authentication is stored in `auth.json`; Codex can alternatively use the operating-system credential store.
  * Claude uses its normal `CLAUDE_CONFIG_DIR` (default `%USERPROFILE%\.claude`). On Windows, authentication is stored in `.credentials.json` in that directory.
* Codex supports a separate state directory through `CODEX_HOME`. Claude supports the same pattern through `CLAUDE_CONFIG_DIR`. Both variables select a complete CLI configuration directory, including credentials and other CLI state.
* Desktop agent selection stores `activeAgent`, one permission mode, and model, reasoning, and speed settings in `settingsByAgent`. There is no account collection or default account setting.
* Action definitions and run requests can override agent, model, reasoning, speed, and permission mode. Their schemas, editors, validation, history, and card-level remembered settings have no account field.
* A conversation stores provider sessions by `agent` only. Continuation and compaction therefore assume that every session for an agent belongs to the single global login.
* Model catalogs and Claude/Codex rate-limit snapshots are also keyed only by agent. Account-reset schedules and `usage_metrics.csv` cannot distinguish two accounts of the same provider.
* The config dialog has a specialized agent-profile editor, but there is no account-management service, directory picker, login bridge, or account editor.

## Implementation details

### Account model and desktop configuration

* Add a validated `desktop.agentAccounts` configuration value. Store accounts per supported built-in agent (`codex` and `claude`). Do not infer account support for custom agent profiles because MD² does not know which configuration-directory variable they use.
* An account record contains:
  * `id`: stable identity used by selections, actions, runs, schedules, metrics, and conversations. Generate a UUID for extra accounts. Use stable reserved IDs for the two primary accounts.
  * `name`: editable display name. For an extra account, initialize it from the selected configuration folder name.
  * `kind`: `primary` or `directory`.
  * `configDirectory`: absolute directory path for a `directory` account only. The path is a persistence location and must never be used as account identity.
* Always resolve one primary account as the first account for Codex and one for Claude. A primary account has no configured directory: processes run with the normal inherited CLI environment and continue using the login already configured outside MD². It can be renamed but cannot have its directory changed or be removed.
* Migrate existing desktop configuration by adding the two primary records and assigning the appropriate primary account to every existing `settingsByAgent` entry. This reflects historical behavior: all existing runs used the global CLI login.
* Add `accountId` to `AgentSettings` and `FlatAgentSelection`. The value in `settingsByAgent[agent]` is that agent's default account. Add `selectAccount`, validation that the account belongs to the selected agent, and resolution that returns the selected account with the existing profile/model settings.
* Reject duplicate account IDs and duplicate normalized extra-account directories. An explicit unknown or mismatched account is an error; do not silently run with the primary account. Account names need only be non-empty and unique within one agent.

### Account setup in the config dialog

* Add an `AgentAccountsEditor` beside the existing agent-profile configuration. Show separate Codex and Claude lists with the primary account first.
* Each row shows the editable name, `Primary` or the configuration-directory path, and login status when it can be determined without reading credential contents into the renderer.
* `Add account` performs this flow:
  1. The user selects or creates a configuration folder through a native desktop folder dialog.
  2. The desktop validates that the resolved absolute folder is not already assigned to another account and creates it when needed.
  3. MD² creates the account record with a UUID and a name derived from the folder name. The user can rename it before or after login; renaming does not rename the folder or change the account ID.
  4. MD² starts the selected CLI in a visible login process using that folder. For Codex, set only `CODEX_HOME` for the process and run `codex login`. For Claude, set only `CLAUDE_CONFIG_DIR`, start `claude`, and initiate `/login` in its interactive terminal.
  5. The user completes the provider-owned browser or terminal login. MD² never asks for, receives, logs, or persists a username or password.
  6. On successful process completion, check the login using the provider's supported status behavior and mark the account available. A cancelled or failed login leaves the account visible as requiring login so the user can retry.
* Add `Log in`/`Reauthenticate` for an existing account. It launches the same isolated flow and lets the CLI update credentials in that account's directory in place.
* Implement account directory selection, directory creation, login process lifecycle, and status checks in a desktop `AgentAccountService`. Expose narrow preload/bridge methods that exchange account metadata and status only. Credential file contents must never cross IPC into React.
* For directory-based Codex accounts, require file credential storage in that account's `CODEX_HOME`; otherwise a shared OS credential-store entry could defeat directory isolation. If local administrator policy forces another store, report that the account cannot be isolated instead of falling back to the primary login.
* Validate every directory operation with resolved absolute paths and operate only on the single directory selected for that account. Do not copy credentials between accounts as part of the normal add flow; the global login is already represented by the primary account.

### Selection in menus and actions

* Add an account selector after the agent selector in:
  * `AgentMenuControls`, where it edits the default `accountId` in `desktop.agentSelection.settingsByAgent[agent]`.
  * `ActionAgentCapabilityFields`, where it writes the optional action-definition field `accountId`.
  * `ActionAgentSelectors`, where it selects the account for the current run and remembers card/action settings through `ActionRunSettingsService`.
* The selector lists only accounts belonging to the selected agent and shows the stored name. When a referenced account no longer exists, retain its ID as an unavailable option and show a validation error.
* Extend `ACTION_DEFINITION_FIELDS`, raw/normalized action types, editor routing, serialization, and validation with optional `accountId`. Like model settings, an explicit action account requires an explicit agent so the ownership can be validated.
* Extend action-run input validation, bridge types, remote-control payloads, run history, activity agent details, and action-definition creation with `accountId`.
* Resolve a new run in this order: run-menu `accountId`, action `accountId`, default account for the resolved agent. Pass the resolved account record to the desktop runner and include its ID in the result/history. Scheduled and chained actions use the same resolution path.

### Process environment and account-scoped services

* Extend `createAgentEnvironment` to accept a resolved account. Preserve the current environment filtering and Claude task-tracking behavior, then:
  * leave both account-directory variables unchanged for a primary account;
  * set `CODEX_HOME` for a directory-based Codex account;
  * set `CLAUDE_CONFIG_DIR` for a directory-based Claude account.
* Pass the resolved account through `ActionAgentExecutor` and `AgentRunnerService`. Store `accountId` on the live run so retries, usage events, diagnostics, and completion records stay associated with the process that actually ran.
* Apply the same account environment to every process that observes provider state: normal and streaming runs, resume/compact runs, model-catalog discovery, Codex cache diagnostics, Claude usage polling, and Codex usage polling.
* Key model-catalog requests, cached catalogs, bridge events, and renderer subscriptions by `(agent, accountId)`. Changing accounts must load that account's catalog rather than reuse another account's cached result.
* Change Claude and Codex runtime services from one snapshot per provider to snapshots keyed by account ID. The toolbar shows the selected default account's limits. Account selectors and reset-schedule forms use the matching account snapshot.
* Use a finite collection of poll contexts keyed by `(agent, accountId)` and stop them on project switch, account removal, or application shutdown. One account's failed or interactive login state must not mark another account unavailable.

### Conversation ownership and continuation

* Add `accountId` to each provider-session record. A provider session is uniquely identified inside a conversation by `(agent, accountId)`, not by agent alone.
* When starting or continuing a conversation, look up the provider session for the resolved agent and account:
  * if it exists, resume that exact provider conversation;
  * if it does not exist, start a new provider conversation and send the complete canonical MD² conversation as context, matching the current behavior when switching agents for the first time.
* Update `updateProviderSession`, normalization, persistence, resume, retry, and compact paths to preserve the account ID. Compaction must always use the account stored on the provider session, regardless of the current default or action setting.
* Migrate provider sessions without `accountId` to that agent's primary account because those sessions predate account switching and were created with the global CLI login.
* Store `accountId` in agent activity details so historical runs show which account was used. Resolve the current display name from desktop configuration; persisted records keep the stable ID so later renames do not rewrite project history.
* If a referenced account is unavailable, continuation and compaction fail with a clear account-specific message. Never resume a provider conversation under a different account.

### Usage metrics and schedules

* Add `account_id` to account-usage and token-usage records in `usage_metrics.csv`, and include it in baseline keys and renderer projections. Migrate existing rows logically to the provider's primary account when reading the old header; write the new header for new files. Do not combine percentage deltas from different accounts.
* Add `accountId` to account-reset schedule triggers, tracker keys, snapshots, labels, persistence, and validation. Existing schedules migrate to the primary account for their agent.
* Record run token usage with the run's account ID. Record rate-limit usage with the account whose environment produced the snapshot.

### Failure handling and compatibility

* A renamed account remains valid because references use `accountId`. A moved, missing, or unreadable extra directory makes only that account unavailable and offers directory reselection or login retry.
* Changing the default account affects only new provider sessions and runs without an explicit account. Existing provider sessions continue with their stored account.
* Logging out or expiring credentials does not trigger fallback to another account. Show a login-required state and keep unrelated accounts usable.
* Existing desktop config, action files, card action settings, conversations, activity records, schedules, and usage metrics require explicit migrations to the primary account where described above.

### Tests

* Shared/config tests: primary-account migration, account validation, stable IDs across rename, unique directories, `selectAccount`, default resolution, and explicit missing-account errors.
* Account service tests: primary environment, Codex/Claude directory environments, folder validation, login command construction, cancellation/failure, status reporting, and confirmation that credential content is never returned over the bridge.
* UI tests: config account creation/rename/retry, default account selection, action account selection, run-menu selection, and unavailable references.
* Action tests: parser/writer support, run-input allowlist, resolution precedence, activity/history persistence, scheduled actions, and remote-control payloads.
* Conversation tests: provider-session uniqueness by agent and account, same-account resume, first switch sending the full transcript, retry, compact using the stored account, and legacy sessions migrating to primary.
* Runtime tests: model catalogs and rate-limit snapshots remain isolated per account; polls use the correct environment and stop cleanly.
* Metrics/schedule tests: account IDs separate baselines and reset trackers, while legacy data resolves to primary.
* Run the directly affected app and desktop tests, then `npm run lint` in both subprojects. Do not run the full test suites unless requested.

## Acceptance criteria

* Every installed Codex and Claude CLI has a primary account that uses its existing global login without moving or copying credentials.
* A user can add an extra account by selecting a configuration folder, completing the provider's login flow, and optionally changing the name derived from that folder.
* MD² never asks for or transports provider usernames, passwords, or credential-file contents.
* The user can select a default account for each agent and can override it in an action definition and in the run menu.
* Runs, model discovery, usage polling, retries, and diagnostics use the selected account's configuration directory.
* A conversation remembers account identity per provider session. Continuing with the same agent and account resumes it; selecting another account starts a separate provider session and sends the full conversation context once.
* Changing defaults or account names does not change the account used by an existing provider session. Compact and resume never cross account boundaries.
* Rate limits, usage metrics, and account-reset schedules remain separate for accounts of the same provider.
* Existing configuration, actions, conversations, activity, schedules, and metrics continue under the primary account after migration.
* Missing folders, expired credentials, cancelled login, and unavailable referenced accounts produce clear errors without falling back to another account or preventing other accounts from running.
* Focused tests and lint pass in `app` and `desktop`.