---
author: 
id: F_417
internalId: 22b04d7f-1a70-41f6-98e8-0236c56b6873
title: after action select focus input box
status: ready
owner: 
affects:
agents:
  - design/activity/card__22b04d7f-1a70-41f6-98e8-0236c56b6873.json
policy:
after: 04c53429-e249-4be6-8a62-8480a72be879
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_focus_request.node.test.ts
  - app/src/components/actions/run/popup/action_popup_focus_request.ts
  - app/src/components/editor/data_sources/use_markdown_draft.test.tsx
  - app/src/components/editor/data_sources/use_markdown_draft.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/source/markdown_source_controller.ts
  - app/src/services/actions/action_prompt_draft_service.ts
  - app/src/services/markdown/markdown_draft.ts
---

after selecting an action in the action-popup:&#x20;

if it has no text for the input box, focus on the input.

if we have a prefilled value for the input, focus the 'send' button

## Current state

- Action popup: `ActionPopup` (`app/src/components/actions/run/popup/action_popup.tsx`) keeps `selectedActionId`. Clicking a button in `ActionSelector` (`action_selector.tsx`) calls `onSelect` → `setSelectedActionId`. Popup open picks initial action via `resolveInitialActionId`.
- `ActionPopupContent` calls `ActionPopupSessionService.select(...)` in a layout effect. When selection identity (action id + context identity) changes, or on first select (popup open), it builds fresh runtime via `createActionPopupBindings` (`action_popup_runtime.ts`). Same identity reuses runtime.
- Input box: `ActionPromptOwner` → `ActionAgentPrompt` → `MarkdownEditor` bound to `ActionPromptDraft` (`app/src/services/actions/action_prompt_draft_service.ts`). Agent actions and command actions (when no command session active) both render it. Read-only popups (`readOnlyMessage`) render no input.
- Prefill: command draft starts with `action.command`, preparation `ready` at once. Agent draft for a new conversation starts `loading`; `ActionPromptOwner` effect calls `promptDraft.prepare(defaultPreparePrompt)` (async, backend). Result replaces draft text, status → `ready`; failure → `failed`. Editor is `readOnly` while status is not `ready`. Existing conversation drafts keep the user's earlier text.
- Send button: `ActionPopupRunControls` (`action_popup_run_controls.tsx`), inside `ActionPopupBottomRow`, rendered embedded in the prompt (and standalone in `CommandAction` during an active command session, without input). Agent: icon button `Send` (`showAgentSend`). Command: button `Run` (`showCommandRun`). Disabled when `runDisabled` (`actionPopupRunDisabled` + history browsing).
- Focus today: no focus handling after action select. `ResizablePopper` focuses popup paper on mount (`setPaperElement` ref callback, `focusOnMount`). Clicking a selector button leaves focus on that button.
- Editor→draft command channel exists: `MarkdownDraft` (`app/src/services/markdown/markdown_draft.ts`, `EventTarget`) dispatches `flushRequested` / `insertionRequested`; `useMarkdownDraft` (`app/src/components/editor/data_sources/use_markdown_draft.ts`) handles them for the mounted editor. No focus request event.

## Implementation details

Terms:
- **Focus request**: one-shot "apply focus rule" flag, created per selection.
- **Prefilled**: prompt draft text non-empty after trim (`!promptDraft.getEmptySnapshot()`) once preparation status is `ready`.
- **Primary button**: `Send` for agent actions, `Run` for command actions.

Trigger: user clicks an action in the selector, and popup open with its initial action. Both create new runtime bindings in `ActionPopupSessionService.select` (identity change), so focus request lives in runtime.

1. New `ActionPopupFocusRequest` (`app/src/components/actions/run/popup/action_popup_focus_request.ts`): holds `pending = true`; `consume(): boolean` returns `pending` and sets it `false`. `createActionPopupBindings` creates one; add `focusRequest` to `ActionPopupRuntime` (`action_popup_types.ts`). Reused runtime (same identity, e.g. context update mid-run) keeps consumed request → no refocus.
2. `MarkdownDraft`: add exported `MARKDOWN_FOCUS_REQUESTED_EVENT = 'focusRequested'` and `requestFocus()` dispatching it (same pattern as `requestFlush`). `ActionPromptDraft.requestFocus()` forwards to `markdownDraft.requestFocus()`. No mounted editor → no listener → no-op.
3. `useMarkdownDraft`: new parameter `focusEditor: () => void`; effect listens to `MARKDOWN_FOCUS_REQUESTED_EVENT` and calls it. `MarkdownEditor` passes a `focusEditor` callback: plain-text mode → `plainTextEditorRef.current?.focus()`; rich mode → `editorRef.current?.focus(undefined, { defaultSelection: 'rootEnd' })` (caret at end). Source mode (`sourceControllerRef.current?.sourceActive`): new `MarkdownSourceController.focus()` calling `this.sourceEditor?.focus()` (CodeMirror view, same as `insertMarkdown` already does).
4. `ActionPopupRunControls` owns the decision (it knows prompt empty state, preparation status, primary button visibility and disabled state):
   - Pass `focusRequest` from runtime: `AgentAction` / `CommandAction` → `ActionPromptOwner` → `ActionPopupBottomRow` → `ActionPopupRunControls` (new prop each). Standalone `ActionPopupBottomRow` in `CommandAction` gets it too.
   - Ref on `Send` `IconButton` and on `Run` `Button` (one `primaryButtonRef`).
   - `useEffect` (not layout effect, so it runs after `ResizablePopper` paper focus in the same commit), deps: `editorSnapshot.preparationStatus`, `promptEmpty`, `runDisabled`, primary button visible, `focusRequest`, `promptDraft`:
     - status `loading` → return; request stays pending (agent prompt still preparing).
     - `!focusRequest.consume()` → return.
     - status `failed` → return (editor read-only; nothing useful to focus).
     - prefilled AND primary button visible AND not `runDisabled` → `primaryButtonRef.current?.focus()`.
     - else → `promptDraft.requestFocus()` (covers empty prompt, disabled button, hidden button).
   - Standalone run controls without input (active command session): button hidden → `requestFocus` hits no editor → no-op. Accepted.
5. Read-only popup (`readOnlyMessage`): no run controls mount → request never consumed → no focus change.

Edge cases:
- Agent prepare slow or waiting for remote reconnect: focus applies when status reaches `ready`, possibly later than select.
- User switches action before preparation finishes: old runtime discarded with its request; new selection gets own request.
- Prepared default text is empty string → treated as not prefilled → input focused.
- Re-click on already selected action: `ToggleButtonGroup` `exclusive` sends `null` → `handleChange` ignores → no new request.
- Mobile (full-screen popup): focusing input opens on-screen keyboard. Same rule applies.

Tests (React Testing Library, mock backend boundaries as existing tests do):
- `action_popup.test.tsx`: (a) select agent action whose prepared prompt is empty → prompt editor has focus; (b) select agent action with prepared non-empty prompt → `Send` button focused after preparation resolves; (c) select command action with command text → `Run` focused; (d) prefilled prompt, run disabled (backend unavailable) → editor focused; (e) popup open with initial action applies same rule; (f) read-only popup → focus unchanged.
- `use_markdown_draft.test.tsx`: focus request event calls `focusEditor`; listener removed on unmount / draft change.
- Unit test for `ActionPopupFocusRequest.consume` (true once, then false).

Out of scope (not requested): focus after selecting a conversation in the conversation picker, focus after run completion, keyboard shortcut changes.

## Acceptance criteria

- Clicking an action in the action selector whose input box is empty → input box gets keyboard focus (caret ready for typing).
- Clicking an action whose input box is prefilled (prepared agent prompt, saved draft, or command text) → `Send` (agent) or `Run` (command) button gets focus; pressing Enter/Space runs it.
- Agent action with asynchronous prompt preparation: focus is applied once preparation finishes, based on resulting text.
- Prefilled input but primary button disabled or hidden → input box gets focus.
- Opening the popup applies same rule to its initially selected action.
- Rule fires once per selection; later prompt edits, run status changes, or context updates of same action do not move focus.
- Read-only popups and preparation failure do not move focus.
- New tests listed above pass; existing popup and markdown editor tests pass.