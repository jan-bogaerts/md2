---
author: 
id: F_178
internalId: 894c324e-d9cf-400f-b964-5256ffff9b24
title: handle codex version errors better
status: ready
owner: 
affects:
agents:
  - design/releases/0_3_0/card__894c324e-d9cf-400f-b964-5256ffff9b24.json#conversation=agent-b2952f70-3b84-46ad-b88c-22192137f11d
  - design/releases/0_3_0/card__894c324e-d9cf-400f-b964-5256ffff9b24.json#conversation=agent-84c09c05-305f-43d9-8ee7-79a326bdae5c
policy:
after: 6e978222-1b68-4e43-bcbf-2e1efa4f6147
---

When vscode updated codex plugin, the global log version has changes and the codex cli begins to complain that an update is required.

we need to handle this better. currently, i think it is only shown the first time it is encountered, but as a local error to that action-popup, hidden behind a small icon.

this needs to be improved. use dialog service to show a snackbar. snackbar needs a button to trigger an auto update of the codex cli. this is a command line statement that needs to be run.

## Current state

- Electron detects Codex `failed to load models cache` and `failed to renew cache TTL` stderr lines once per agent run. It compares running CLI version with `client_version` from `models_cache.json` and adds a diagnostic, including `npm install --global @openai/codex@latest`, to that run's stderr.
- Renderer exposes failed action stderr only through red error icon in action popup. Cache warning can therefore stay hidden, and separate runs can repeat same diagnosis.
- `dialogService` renders non-critical messages as persistent snackbars, but message model supports text and close control only. It has no action button.
- Preload exposes specific action and Codex-runtime methods. It intentionally exposes no arbitrary command runner, and no method currently updates Codex CLI.

## implementation details

- Treat confirmed mismatch between running Codex core version and cache `client_version` as account-wide **Codex update required** event. Account-wide means event is not owned by one card, popup, or action phase. Keep original diagnostic in action stderr for traceability; matching or unknown versions remain local diagnostics and do not offer an update.
- Publish update-required event through desktop `CodexRuntimeService`, local bridge dispatch, preload allowlist, and typed renderer Codex-runtime bridge. Include running and cache versions. Deduplicate identical mismatch for Electron session so concurrent or later runs do not queue duplicate snackbars.
- Add optional snackbar action to `dialogService` message contract: label plus callback. Existing call sites keep text-only behavior. `DialogDisplay` renders action as MUI button and removes message only after user closes it or action succeeds; disable button while asynchronous callback runs.
- Add renderer Codex CLI update service. Start it during app bootstrap, subscribe to update-required events, and call `dialogService.warning` with persistent message and **Update Codex** action. Browser mode has no desktop bridge, so it keeps existing local action error behavior.
- Expose dedicated `updateCodexCli()` bridge method. Electron main process runs only `npm install --global @openai/codex@latest`; do not expose arbitrary shell command or accept renderer-supplied command text. Run hidden, capture bounded stdout/stderr, and reject on spawn failure or non-zero exit.
- While update runs, keep button disabled. On success, close warning and show success snackbar telling user to retry action; new Codex processes use installed version. Do not restart MD2 or retry failed action automatically. On failure, keep warning available for retry and show failure through `dialogService.error` with shortest useful process error.
- Update desktop diagnostic/runtime/bridge tests and renderer bridge/service/dialog tests. Cover mismatch-only notification, session deduplication, fixed command, pending button, success, failure, retry, and unchanged text-only messages.

## acceptance criteria

- First confirmed CLI/cache version mismatch in Electron session shows persistent global warning snackbar with both versions and **Update Codex** button, whether action popup is open or closed.
- Same mismatch from same or another action during session does not add another snackbar. Diagnostic remains available in affected action stderr.
- Matching versions or unavailable version data produce existing local diagnostic only; they do not show update snackbar.
- Clicking **Update Codex** invokes exactly `npm install --global @openai/codex@latest` in Electron main process. Renderer cannot provide another command.
- Button stays disabled while install runs. Successful install closes warning and shows instruction to retry action; MD2 does not restart and failed action is not retried automatically.
- Spawn failure or non-zero exit shows concise error snackbar, keeps update warning retryable, and does not crash app or hide action-local diagnostic.
- Browser mode remains functional without update button or desktop bridge. Existing text-only `dialogService` snackbars and critical dialogs keep current behavior.
