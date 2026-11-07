---
author: 
id: B_340
internalId: e624b075-cb06-452d-a838-dc64137918d8
title: Error: Local file link points outside active repos
status: ready
owner: 
affects:
agents:
  - design/activity/card__e624b075-cb06-452d-a838-dc64137918d8.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 155397337
sentryOrganization: elastetic
changedFiles:
  - app/src/components/actions/conversation/messages/action_conversation_link.tsx
  - app/src/components/actions/conversation/messages/action_conversation_link_navigation.node.test.ts
  - app/src/components/actions/conversation/messages/action_conversation_link_navigation.ts
  - app/src/data/electron_action_bridge.ts
  - desktop/main.js
  - desktop/src/git/diff_service.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/preload.js
  - shared/local_file_link_errors.d.mts
  - shared/local_file_link_errors.mjs
after: 885c223a-31ec-48c3-8390-f85015ab9c23
---

## Sentry issue

**Title:** Error: Local file link points outside active repository and registered worktrees

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/155397337/)

**First seen:** 2026-10-22T08:28:00Z

**Last seen:** 2026-10-22T08:28:00Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** mre(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js)

**Event ID:** 5c3a32cea3c44731be790c5d012b8f70

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:780:24106` — async DYe
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2554` — gre
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2422` — Bm
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-DeUuw8S2.js:136:2274` — mre

## Current state

Markdown links in conversation messages, including submitted prompts and agent responses, are handled by `ActionConversationLink`. Repository files open in the internal editor or the configured external editor. The desktop `openInEditor` path rejects targets outside the primary repository and registered worktrees, and the renderer reports that expected rejection to Sentry through `dialogService.error`.

The desktop already uses Electron's `shell.openPath` elsewhere, but conversation links do not expose an operating-system open path. Links rendered in project Markdown documents are not affected.

## Implementation details

- Keep the existing internal-editor and configured-editor routing for files inside the primary repository or a registered worktree.
- Add a narrow desktop bridge operation that opens an existing outside-repository file with Electron's `shell.openPath`. Do not build or execute a shell command.
- Resolve and decode the clicked local path in the desktop process. Relative paths remain relative to the conversation repository root; absolute paths retain their location. Remove a numeric line suffix before operating-system opening.
- Verify that the resolved target exists and is a regular file before opening it. Missing, malformed, and directory targets return a clear expected validation error.
- Treat expected local-link validation failures as user-facing errors through `dialogService.displayError`, without reporting them to Sentry. Continue reporting unexpected bridge and operating-system launch failures through `dialogService.error`.
- Add focused tests for path resolution, repository routing, outside-repository operating-system opening, missing targets, directories, and telemetry routing.

## Acceptance criteria

- Clicking an agent-conversation link to a file inside the primary repository or a registered worktree keeps the current internal-editor or configured-editor behavior.
- Clicking an absolute or relative agent-conversation link that resolves to an existing file outside those repositories opens it with the operating system's default application.
- A numeric line suffix does not become part of the path passed to the operating system.
- Missing, malformed, and directory targets show a clear error and do not open anything.
- Expected link-validation failures are not reported to Sentry, while unexpected launch failures are reported.
- The behavior applies to links in submitted prompts and agent responses. Links rendered in project Markdown documents remain unchanged.
