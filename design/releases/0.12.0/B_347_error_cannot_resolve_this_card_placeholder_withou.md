---
author: 
id: B_347
internalId: 5f556f36-aa43-429a-be26-b901b056e4aa
title: Error: Cannot resolve this-card placeholder withou
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__5f556f36-aa43-429a-be26-b901b056e4aa.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 159110069
sentryOrganization: elastetic
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/data/electron_action_bridge.node.test.ts
  - app/src/services/actions/action_error_reporting.node.test.ts
  - app/src/services/actions/action_error_reporting.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - desktop/src/actions/action/action_text.js
  - desktop/src/actions/action/action_text.test.mjs
  - shared/action_errors.d.mts
  - shared/action_errors.mjs
after: d78bbdec-cace-478a-8639-cc4afa66c7b6
---
## Sentry issue

**Title:** Error: Cannot resolve this-card placeholder without a file context

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/159110069/)

**First seen:** 2026-11-06T12:28:39Z

**Last seen:** 2026-11-06T12:28:39Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Ire(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js)

**Event ID:** 39bbc98ee03a441e8a078a7ed87591b0

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:146:67451` — async Sie.prepare
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:734:44584` — async FVe
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:146:2554` — Rre
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:146:2422` — Wm
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-Cz1fWlUi.js:146:2274` — Ire

This is a legit error, but we should improve the message a little bit. It occurred because I activated an action in the project-agent-popup that had a prompt which used the placeholder { { this } } (added extra spaces to prevent the placeholder from being replaced). So we should inform the user of this in the error message. it should also not be sent to sentry

## Current state

Opening a project action prepares its configured prompt through `ActionRunnerService.prepareActionPrompt()`. `resolvePlaceholders()` recognizes `{{this-card}}` as an alias of `{{card-file}}` and requires `ActionContext.file`, the repository-relative card or file path. Project context has no file, so preparation fails before an agent starts with `Cannot resolve this-card placeholder without a file context`.

`ActionAgentPrompt` catches that expected configuration error and passes it to `dialogService.error`. That method displays the message and reports every received value to Sentry, so this user-correctable prompt/context mismatch is recorded as an application failure. Failed preparation leaves the prompt read-only and prevents the action from running.

## implementation details

* In `desktop/src/actions/action/action_text.js`, give the missing `{{this-card}}` context error a stable error code and replace its message with: `Cannot prepare action prompt: {{this-card}} requires a card or file context, but this action was opened from the project. Open the action from a card or remove {{this-card}} from the action prompt.` A card or file context means an action context containing `context.file`.
* Keep `{{this-card}}` resolution unchanged when `context.file` exists. Keep `{{card-file}}`, other placeholders, and other preparation failures unchanged.
* Preserve the error code through the existing bridge-error envelope and renderer rehydration used by Electron IPC and remote control. Do not infer this expected condition from message text.
* Add one action-error reporting function in `app/src/services/actions/`. For the stable missing-card-context code, call `dialogService.displayError` so the message is shown without telemetry. For every other error, call `dialogService.error` so existing Sentry reporting remains intact.
* Use that reporting function when configured prompt preparation fails in `ActionAgentPrompt` and when an edited popup prompt fails before an action starts in `action_popup_operations.ts`. This covers both automatic preparation and a user-entered `{{this-card}}` placeholder in project context.
* Update focused tests for placeholder resolution, bridge error-code preservation, prompt preparation, and popup run failure. Verify the expected error uses `displayError`, never `dialogService.error`, while unrelated failures still use `dialogService.error`.

## acceptance criteria

* Opening a project action whose configured prompt contains `{{this-card}}` shows the new message, leaves the prompt unavailable, and does not start an agent.
* Running an edited project-context prompt containing `{{this-card}}` shows the same message and does not start an agent.
* Neither path sends this expected error to Sentry.
* Opening or running the same action from a card or file context resolves `{{this-card}}` to `context.file` and continues normally.
* `{{card-file}}`, all other placeholders, and their current validation behavior remain unchanged.
* Unrelated prompt-preparation and action-start failures remain user-visible and continue to be reported to Sentry.
* Behavior is identical through local Electron IPC and remote-control transport.
