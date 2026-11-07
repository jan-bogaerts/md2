---
author: 
id: B_335
internalId: 3cf661d6-03c8-463b-9216-91fb1efc98e0
title: Error: Assigned worktree branch "j_23_create_the_s
status: ready
owner: 
affects:
agents:
  - design/activity/card__3cf661d6-03c8-463b-9216-91fb1efc98e0.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 155870542
sentryOrganization: elastetic
after: 3d6ec998-7fae-40b4-a894-4606092f34e0
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.tsx
---

## Sentry issue

**Title:** Error: Assigned worktree branch "j_23_create_the_shared_analysis_result_buffer" is unavailable. Select a worktree again.

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/155870542/)

**First seen:** 2026-10-24T09:37:22Z

**Last seen:** 2026-10-29T15:44:48Z

**Occurrences:** 2

**Release:** Not provided

**Environment:** production

**Culprit:** mre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js)

**Event ID:** fcfb7193fca342fe86be7583ed1ed5f2

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:64355` — async eie.prepare
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:724:44221` — async HRe
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2554` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2422` — Bm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2274` — mre

## Current state

The card stores `j_23_create_the_shared_analysis_result_buffer` as its assigned worktree branch, but that branch is absent from the current linked-worktree records. `resolveWorktreeAssignment` correctly treats this as a stale assignment so an action cannot run in a different checkout.

The action popup already derives the resulting validation message through `worktreeValidationMessage`, displays it, and disables execution. `ActionAgentPrompt` nevertheless starts automatic prompt preparation for a new conversation. The desktop resolves the same worktree in `ActionWorktreeRunService`, throws the expected validation error, and the preparation catch reports it to Sentry through `reportActionError`.

## Implementation details

- In `ActionAgentPrompt`, do not start automatic prompt preparation while `runValidationError` is present. Include the validation value in the effect dependencies so preparation is reconsidered when the assignment becomes valid.
- Keep the prompt draft in its existing loading state while the assignment is invalid. The draft retains its pending preparation, so selecting a valid worktree lets the existing effect prepare it without a new service or compatibility path.
- Keep `resolveWorktreeAssignment`, `worktreeValidationMessage`, and the desktop worktree validation unchanged. They correctly prevent execution against the wrong checkout.
- Add a focused `action_agent_prompt.test.tsx` regression test that supplies a worktree validation error and verifies that `defaultPreparePrompt` is not called. Verify that removing the validation error allows preparation to proceed.

## Acceptance criteria

- Opening an agent action for a stale or unavailable worktree assignment displays the existing validation message.
- Automatic prompt preparation does not call the desktop bridge while the worktree assignment is invalid.
- The expected stale-assignment state is not reported to Sentry as a prompt-preparation failure.
- Selecting a valid worktree prepares the prompt without closing or reopening the popup.
- Valid assignments and actions that do not require a worktree retain their current prompt-preparation behavior.
- The desktop continues to reject stale worktree assignments if a request reaches it through another path.
