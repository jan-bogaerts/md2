---
author: 
id: F_437
internalId: ab1ad841-86e6-43fb-a211-9ce1f1eaf246
title: add agent account lifecycle service
status: ready
owner: 
affects:
agents:
  - design/activity/card__ab1ad841-86e6-43fb-a211-9ce1f1eaf246.json
policy:
branch: f_437_add_agent_account_lifecycle_service
after: 733d678c-49a7-4409-9fa2-5fb384821513
worktree: 1
changedFiles:
  - desktop/main.js
  - desktop/src/actions/agent/agent_account_environment.js
  - desktop/src/actions/agent/agent_account_environment.test.mjs
  - desktop/src/actions/agent/agent_account_service.js
  - desktop/src/actions/agent/agent_account_service.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
---

Add the desktop service and narrow bridge operations needed to create, inspect, authenticate, update, and remove configured Codex and Claude accounts. This task does not add the React account editor.

## Current state

* Desktop already owns native folder dialogs, process spawning, desktop configuration, and preload/local bridge dispatch.
* There is no service responsible for provider account directories or login lifecycle.
* Agent processes inherit one desktop environment. Credentials are managed by the provider CLIs outside the renderer.

## Implementation details

* Add a desktop `AgentAccountService` that owns account directory validation, login process lifecycle, status checks, and account metadata exposed to the renderer.
* For a new directory account:
  1. Open a native folder picker that permits selecting or creating one folder.
  2. Resolve the absolute path, reject a path already assigned to another account, and create the selected folder when needed.
  3. Create the account with a UUID and a display name derived from the folder name.
  4. Start the provider-owned login flow in a visible process.
* For Codex directory accounts, set `CODEX_HOME` only for the launched process and run `codex login`. Require file credential storage inside that account directory; if administrator policy forces shared credential storage, report that the account cannot be isolated.
* For Claude directory accounts, set `CLAUDE_CONFIG_DIR` only for the launched process, start `claude`, and initiate `/login` in its interactive terminal.
* For the initial account, login or reauthentication uses the normal inherited environment without adding either account-directory variable.
* After login finishes, use provider-supported status behavior to determine availability. Cancellation or failure leaves the configured account present and requiring login so it can be retried.
* Support reauthentication, renaming, and directory reselection. Reselection updates only the persistence path; it does not change account identity or copy credentials.
* Allow removal of directory accounts only. Removing an account removes its configuration record but never deletes its directory or credentials. The initial account cannot be removed or assigned a directory.
* Expose narrow preload and local desktop bridge operations for account metadata, folder selection, status, login, rename, reselection, and removal. Credential-file contents, usernames, passwords, and tokens must never cross IPC.
* Validate every filesystem operation against the one resolved absolute directory selected for that account. Do not scan unrelated provider directories or copy credentials between accounts.
* Add service and bridge tests covering command construction, environment isolation, folder validation, cancellation, failed login, status reporting, reselection, removal, and metadata-only responses.

## Acceptance criteria

* A Codex or Claude directory account can be created from one selected folder and receives a stable UUID and derived name.
* Login and reauthentication run visibly with only the selected provider's directory environment override.
* The initial account continues to use the normal inherited provider environment.
* Failed or cancelled authentication does not remove the account and produces a retryable status.
* Missing or unreadable directories affect only their account and can be reselected without changing account ID.
* Removing a directory account does not delete its folder or credentials; the initial account cannot be removed.
* No credential contents or provider secrets are returned through any bridge operation.
