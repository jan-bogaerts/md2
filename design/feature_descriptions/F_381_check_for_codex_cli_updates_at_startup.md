---
id: F_381
title: check for Codex CLI updates at startup
status: new
internalId: 567ff5d6-ed2a-4bad-85bc-902c21642604
after: 630757d3-c37f-4fa9-99f8-7b2fa20fbf97
---

At startup, check asynchronously whether the Codex CLI used by MD² has a newer version available. When it can be updated, show the existing **Update Codex** snackbar action and use the existing update command.

## Current state

- [F_178](../releases/0_3_0/F_178_handle_codex_version_errors_better.md) added an update warning only after a Codex run reports a model-cache error and the running CLI version differs from the cache version. A newer published release alone produces no warning.
- `CodexCliUpdateService.start()` subscribes to that mismatch event during renderer startup. Its snackbar action calls the dedicated Electron `updateCodexCli()` bridge method, which runs `npm install --global @openai/codex@latest`.
- Codex commands come from agent profiles, so a configured executable may differ from the global npm installation that this command updates.

## Required behavior

- Start one background check when the desktop app starts, after the renderer subscribes to Codex update notifications. Do not delay startup, project loading, or agent use while checking. Browser mode has no check.
- In Electron, determine the version of the Codex executable that MD² would run and the latest available version of `@openai/codex`. Compare versions numerically, including prerelease semantics; offer an update only when the published version is newer.
- Offer the existing npm update action only when the executable being checked is the global npm Codex installation that the action will update. If the executable is missing, its version cannot be read, the latest version cannot be obtained, or its installation source cannot be confirmed, do not claim that an update is available.
- Reuse the existing `CodexCliUpdateService` snackbar and `updateCodexCli()` bridge action. Refactor the warning payload and presentation as needed so a release update says **installed version → available version**, while a model-cache mismatch keeps its distinct explanation. Deduplicate warnings if both checks identify the same needed update.
- Keep the existing model-cache diagnostic and its update warning. A failed startup check must not prevent that path from working. Keep the update button's current pending, success, failure, and retry behavior.

## Implementation and verification

- Add a bounded, asynchronous version query in the Electron Codex update path and expose only the resulting update status through the dedicated bridge. Keep command execution out of the renderer.
- Extend renderer startup to trigger the check after the update subscription is active. Keep the result in the existing update service rather than component state.
- Test newer, equal, older, and prerelease versions; missing or unconfirmed npm installation; unavailable version source; startup remaining usable while the check runs; and deduplication with the cache-mismatch warning. Verify that both warning sources invoke the same fixed update command.
