---
author: 
id: B_291
internalId: 985eabb4-1032-49e3-9523-580c67467696
title: Error: Queued agent prompt is empty
status: ready
owner: 
affects:
agents:
  - design/activity/card__985eabb4-1032-49e3-9523-580c67467696.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 145990654
sentryOrganization: elastetic
after: f3b7a6f7-0cc4-4d30-994b-026f9d5d8092
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
  - app/src/components/actions/run/popup/action_popup_operations.node.test.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - desktop/src/actions/action/action_run.test.mjs
---

## Current state

The exception is raised in `runPopupAction` when a live agent run is detected but the prompt draft selected for that run is empty. The Sentry stack shows that the path was entered through the prompt editor's `Ctrl/Cmd+Enter` shortcut.

The shortcut handler reads part of its run state from the last React render. A scheduled run can become active before React rerenders, so the shortcut can pass validation using stale idle state. `runPopupAction` then reads the current active run, switches to the active conversation draft, and reports `Queued agent prompt is empty`.

The scheduler previously created a replacement conversation for every scheduled run. That defect is already fixed. Schedule registration now stores the displayed `AgentConversation.id`, and scheduled execution validates and continues that conversation with its persisted reference. The desktop and renderer therefore use the same canonical conversation identity.

## Implementation details

- In the prompt shortcut handler, derive the complete run state from a fresh `currentActionRun(bindingStore)` snapshot immediately before dispatch. Do not combine a fresh run with render-captured status or action-type values.
- In `runPopupAction`, treat an empty prompt discovered after an agent run becomes active as a stale UI interaction. Return without creating a submission, enqueueing a prompt, or reporting an error.
- Keep the desktop queue validation that rejects empty prompts. It remains the defensive boundary for invalid bridge calls.
- Do not change scheduler conversation continuation. It already persists `conversationId`, validates the conversation's action and card ownership, and supplies `continueFrom` when the schedule fires.
- Add focused renderer tests for an externally started or scheduled run becoming active before the shortcut handler rerenders.

## Acceptance criteria

- Pressing `Ctrl/Cmd+Enter` after a scheduled agent run becomes active but before the prompt UI rerenders does not report `Queued agent prompt is empty`.
- The stale shortcut does not create a submission or call the queued-prompt bridge.
- A non-empty prompt entered for an active agent run is still queued normally.
- Empty queued prompts sent directly to the desktop bridge are still rejected.
- A schedule created for an existing conversation continues the same `AgentConversation.id` and does not create a replacement conversation.
- Scheduled runs without an existing conversation continue to allocate one new conversation identity.

## Sentry issue

**Title:** Error: Queued agent prompt is empty

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/145990654/)

**First seen:** 2026-09-16T12:11:52Z

**Last seen:** 2026-09-16T12:11:52Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** V2(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js)

**Event ID:** 7f3de1034fef41a0ad455de66decdf70

### Application stack frames

* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:25:6718` — HTMLBodyElement.r
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:11:28324` — kf
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:11:28503` — Af
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:127780` — Zu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:15085` — Zt
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:131553` — unknown function
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:10:126356` — Gu
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2319:18194` — onKeyDownCapture
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2321:9090` — onRunShortcut
* `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-BEXaJcv8.js:2319:22034` — V2
