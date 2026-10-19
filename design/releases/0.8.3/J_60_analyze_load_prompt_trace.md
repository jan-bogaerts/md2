---
author: 
id: J_60
internalId: 1eb24b57-bc11-41d1-8c8f-296b0dba31c1
title: analyze load prompt trace
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__1eb24b57-bc11-41d1-8c8f-296b0dba31c1.json
policy:
after: a0d1eee2-1989-41e0-800d-9667640d35b2
changedFiles:
  - app/.j60-profile/config.mts
  - app/.j60-profile/index.html
  - app/.j60-profile/measure.js
  - app/.j60-profile/profile.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_content.tsx
  - app/src/components/actions/run/popup/action_popup_defaults.node.test.ts
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/components/actions/run/popup/action_popup_session.tsx
  - app/src/components/actions/run/popup/action_popup_session_service.node.test.ts
  - app/src/components/actions/run/popup/action_popup_session_service.ts
  - app/src/components/editor/data_sources/reset_markdown_draft_command.ts
  - app/src/components/editor/data_sources/use_markdown_draft.test.tsx
  - app/src/components/editor/data_sources/use_markdown_draft.ts
  - app/src/components/editor/file_search/markdown_file_search_typeahead_plugin.tsx
  - app/src/components/editor/local_search/markdown_local_text_search_plugin.tsx
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor_reliability.real.test.tsx
  - app/src/components/editor/placeholders/markdown_placeholder_typeahead_plugin.tsx
  - app/src/components/editor/source/markdown_source_controller.ts
---

This trace records a switch between actions in an already-open action popup: [Trace-load prompt.json](file:///C:/Users/janbo/Documents/dev/Trace-load%20prompt.json).

## Findings

- Switching actions changes the `ActionPopupSession` key in `action_popup_content.tsx`. React remounts the session, including the popup frame, selectors, controls, and Markdown editor, and creates new action-specific stores.
- The switch blocks the renderer for approximately 386 ms. Prompt preparation starts around 1.856 s; the prepared draft replaces the editor content around 2.778 s. The editor becomes editable around 2.80 s, approximately 1.32 s after the click.
- `defaultPreparePrompt` currently flushes all pending project changes before calling the desktop backend. The trace cannot separate persistence, bridge, and backend costs within the approximately 920 ms preparation interval.
- Development/debugger instrumentation amplifies the recorded activity. Measure improvements in a production build as well.

## Required changes

### 1. Flush action definitions only during prompt preparation

In `action_popup_defaults.ts`, replace the project-wide flush in `defaultPreparePrompt` with the existing action draft store's `flushDrafts()` when action drafts are pending. Preparation must use current action definitions and report flush failures through the existing error path.

Keep the full project flush before execution in `electron_action_runner.ts`. Prompt preparation must not stage or save unrelated card and instruction editors, or drain unrelated storage writes.

### 2. Keep the popup frame mounted across action switches

Move the stable popup surface outside the action-keyed session boundary. Refactor `action_popup_content.tsx`, `action_popup_session.tsx`, and `action_popup_frame.tsx` so switching actions updates the selected action and active bindings without remounting `ResizablePopper`, the typeahead provider, or the shared header and action selector.

Action-specific subscriptions must follow the selected bindings. Preserve popup position, size, expansion, and drag behavior. Keep model and view state in services; the stable layout must not reuse the previous action's run or conversation state.

### 3. Keep the prompt editor mounted between agent actions

Refactor `agent_action.tsx`, `action_prompt_owner.tsx`, and `action_agent_prompt.tsx` so the editor survives agent-to-agent switches and binds to the selected action's draft. Reuse the existing draft-binding behavior in `MarkdownEditor` / `useMarkdownDraft`; retain separate drafts through `ActionPromptDraftService`.

Flush the outgoing editor buffer before rebinding, then replace content from the incoming draft. Clear action-specific editor history and transient search/typeahead state when rebinding. Preserve loading/read-only behavior and ensure late preparation results update only their owning draft. Agent-to-command switches may remount the editor when its configuration changes.

## Verification

Add focused regression coverage for action-only preparation flushes and full execution flushes; frame/editor preservation across agent switches; draft preservation during rapid A-to-B-to-A switches; late preparation results; conversation selection and active-run routing; and agent-to-command transitions. Check flush failures and subscription cleanup. Run affected tests and lint for implementation changes.

Re-record action switching and compare renderer blocking time, preparation duration, and time until the editor is editable. Do not set a latency target from this development trace alone.
