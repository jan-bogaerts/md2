---
author:
id: B_77
internalId: 455a095f-9014-4c81-b327-87b6f3a969cc
title: Uncaught React errors bypass dialog service
status: ready
owner:
affects:
agents:
policy:
after: f316134f-9019-4a02-baee-3a1e02f67151
---

# Problem

React components and hooks contain `throw` statements that are not protected by a local `try/catch`. Errors from render and hook execution can break the component tree, while errors from event and UI callbacks can become uncaught exceptions. In both cases, the user may not receive an actionable error dialog.

The production React code under `app/src` contains:

- no direct throws in the top-level body of a functional component;
- no throws in class `render` methods or dedicated render callbacks;
- 14 throws in custom hooks or hook callbacks;
- 42 throws in event or UI callbacks.

This inventory excludes tests, service errors reached only transitively, and throws already inside a `try`, `catch`, or `finally` block.

# Affected locations

## Render

No direct top-level functional-component or render-function throws were found.

## Hooks

Direct custom-hook or hook snapshot execution:

- `app/src/components/actions/use_action_editor_controller.ts:26` — missing persisted action source path.
- `app/src/components/actions/use_action_editor_controller.ts:77` — missing open action document.
- `app/src/components/text_view/file_tree_context.ts:19` — `useFileTreeContext` used outside its provider.
- `app/src/theme/use_app_theme.ts:7` — `useAppTheme` used outside its provider.
- `app/src/components/hooks/use_active_document.ts:14` — active-action snapshot has no source path.

`useEffect` callbacks:

- `app/src/components/card_view/card_body_popover.tsx:107` — missing card identity.
- `app/src/components/card_view/card_view.tsx:89` — missing card-view root element.
- `app/src/components/editor/markdown_document_history_monitor.tsx:15` — missing history configuration.
- `app/src/components/editor/markdown_document_history_plugin.tsx:13` — missing history store.
- `app/src/components/editor/markdown_editor.tsx:195` — editor is not mounted.
- `app/src/components/shell/mobile_layout.tsx:18` — missing mobile-layout container.
- `app/src/components/shell/split_layout.tsx:45` — missing split-layout container.
- `app/src/components/text_view/file_tree_view.tsx:65` — missing file-tree container in `useElementHeight`.
- `app/src/components/text_view/text_view.tsx:68` — missing text-view root element.

## Event and UI callbacks

- `app/src/components/actions/action_agent_question.tsx:19,23,27` — text, select, and other-answer change handlers require a question ID.
- `app/src/components/actions/action_agent_single_response_question.tsx:17` — option click requires option data.
- `app/src/components/actions/action_entry_points.tsx:80` — action-entry click requires an action ID.
- `app/src/components/actions/action_filter_editor.tsx:108,115,123,136` — add, field-change, value-change, and remove handlers.
- `app/src/components/actions/action_on_rules_editor.tsx:29` — rule change requires an existing rule.
- `app/src/components/actions/action_phrase_buttons.tsx:18,24` — click and double-click require phrase text.
- `app/src/components/actions/action_popup.tsx:62` — add-action callback requires the custom prompt action.
- `app/src/components/actions/card_action_popup_host_entry.tsx:21` — conversation-viewed callback requires a card path.
- `app/src/components/card_view/card_body_popover.tsx:142` — commit selection requires a card internal ID.
- `app/src/components/card_view/card_commit_diff_panel.tsx:40` — changed-file selection requires a path.
- `app/src/components/card_view/card_commit_menu.tsx:26` — commit menu selection requires a valid index and commit.
- `app/src/components/card_view/project_card_view.tsx:145` — open-body menu callback requires the card element.
- `app/src/components/config/markdown_config_section.tsx:55` — style change requires a known preset.
- `app/src/components/config/worktree_config_list.tsx:26,36,38` — worktree remove request and confirmation.
- `app/src/components/editor/markdown_placeholder_toolbar_control.tsx:31,32` — placeholder click requires a known placeholder and active editor.
- `app/src/components/remarkable_import_panel.tsx:112,140,146,147,159` — connection, import, and conversion actions. These callbacks are passed to `runGuarded`, but the throw statements have no local `try/catch`.
- `app/src/components/resizable_popover.tsx:119` — resize pointer handler requires the popover paper element.
- `app/src/components/resizable_popper.tsx:204,226` — drag and resize pointer handlers require the popper paper element.
- `app/src/components/shell/menu/app_menu.tsx:196` — create-action handler throws before its existing `try`.
- `app/src/components/shell/project/use_project_toolbar_menu_actions.ts:199` — create-remote-project callback requires a root path. One internal call is caught, but the callback is also exposed to UI components.
- `app/src/components/shell/search/search_panel.tsx:151` — action selection requires a source path in text view.
- `app/src/components/text_view/file_tree_view.tsx:135,151` — node activation and item creation callbacks.
- `app/src/components/text_view/list_editor_toolbar_controls.tsx:65,71,78` — conversation, properties, and agent-popup callbacks.
- `app/src/components/text_view/tab_bar.tsx:104` — tab close requires a valid document.
- `app/src/components/worktree_selector.tsx:139` — worktree menu selection requires a valid index.

# Fix

## Render and hooks

- Do not throw from render or hook execution.
- Report the error through `dialogService.error`.
- When the condition is detected during render or direct custom-hook execution, report it from an effect and return a safe loading or fallback state.
- When the condition is detected inside an effect callback, call `dialogService.error` and stop that effect's invalid workflow.
- Keep the current error text or provide an equally specific fallback message.

## Event and UI callbacks

- Add a `try/catch` around each affected callback.
- Catch synchronous errors and awaited asynchronous failures in the same handler.
- In the `catch`, call `dialogService.error(error, { fallbackMessage })` with a context-specific fallback message.
- Do not rethrow after the error has been reported.
- Preserve the current success behavior and stop the failed workflow without applying later state changes.

# Edge cases

- React Strict Mode may execute render and effect paths more than once; one failure must not open duplicate dialogs repeatedly.
- A missing ref during mount, unmount, or view switching must render safely and must not continue DOM operations.
- Async callbacks must catch failures after every `await`.
- Callback failures must not leave busy, submitting, drag, resize, menu, popup, or dialog state stuck.
- Existing `runGuarded` behavior in the Remarkable panel must not produce duplicate dialogs when local `try/catch` handling is added.
- Provider hooks must return a safe result or expose an explicit error state after reporting the missing provider.

# Acceptance criteria

- No affected render path, hook, event callback, or UI callback leaves an uncaught error.
- Render and hook failures are reported through `dialogService.error` and produce a safe loading or fallback state.
- Every affected event and UI callback has a `try/catch` and reports failures through `dialogService.error`.
- Reported errors retain a specific message or a context-specific fallback message.
- Failed callbacks do not continue with later state changes and do not leave transient UI state stuck.
- Tests cover representative render, hook, synchronous event, and asynchronous event failures.
- Tests verify that the dialog is shown, the component remains usable, and no handled error is rethrown.
- `npm run lint-fix`, `npm run lint`, and `npm run test` pass in `app`.

# See also

- `agents.md` — React error handling and `dialogService` requirements.
- `app/src/services/dialog_service.ts`
