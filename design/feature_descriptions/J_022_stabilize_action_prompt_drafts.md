---
author:
id: J-022
internalId: 5b39ff1e-4bbc-4d50-b527-36e1d1faa6f5
title: move action prompt drafts out of popup React state
status: ready
owner:
affects:
  - app/src/components/actions/action_prompt_draft.ts
  - app/src/components/actions/action_agent_prompt.tsx
  - app/src/components/actions/action_popup_bottom_row.tsx
  - app/src/components/actions/action_popup_content.tsx
  - app/src/components/actions/use_action_popup_controller.ts
  - app/src/services/actions/action_execution_service.ts
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Give each action prompt draft one lifetime-stable external store. Typing, flushing, preparing, replacing, clearing, restoring, and remotely synchronizing a prompt must not place the prompt text or reset counters in `ActionPopupContent` or its controller React state.

This job must land before the major action-popup ownership and subscription refactor.

## Current architecture

Prompt ownership is duplicated:

- `useActionPopupController` stores prompt value, preparation status, and reset token in React state.
- `ActionPopupContent` creates a new `ActionPromptDraft` whenever the controller prompt or reset token changes.
- `ActionPromptDraft` buffers live editor values and supports a narrow bottom-row subscription.
- `ActionExecutionService` separately stores prompt values, revisions, pending bridge writes, and remote prompt sessions.

Ordinary typing already stays out of root React state because `MarkdownEditor.onLiveChange` writes to `ActionPromptDraft`. Editor flush still calls `setPromptState`, and external preparation/replacement/clear operations update root state and replace the draft object. Those paths rerender the complete popup.

## Required ownership

Create one prompt-draft service that owns stable draft stores keyed by the action context and, when applicable, the active agent session. The service is justified because it owns state, draft lifecycle, asynchronous bridge synchronization, revisions, and pending writes.

Move the current prompt-draft map and remote prompt-session behavior out of `ActionExecutionService`. The renamed run/session service planned by the later popup refactor must not retain prompt text ownership.

Each stable draft store exposes, at minimum:

- current Markdown value;
- preparation state: `loading`, `ready`, or `failed`;
- a narrow subscription contract suitable for `useSyncExternalStore`;
- local edit without React parent state;
- external replacement that notifies the editor to call `setMarkdown` once;
- clear, flush/synchronize, send, and current-value reads;
- revision protection for superseded asynchronous preparation and remote writes.

Do not add arbitrary retention limits or silent eviction. Draft removal must follow explicit lifecycle events such as successful send, deliberate clear, action removal, or project teardown. A popup unmount does not discard an unsent draft.

## Component changes

- `ActionPopupContent` obtains or receives the stable draft store but does not subscribe to its value or preparation state.
- `useActionPopupController` removes `promptState`, `promptResetToken`, prompt-value derivation, and `handlePromptChange` state updates.
- `ActionAgentPrompt` owns the editor-facing subscription for preparation/read-only presentation and listens for explicit replacements. It remains mounted and preserves normal editor buffering.
- `ActionPopupBottomRow` remains the narrow subscriber for live prompt-dependent button state.
- Other prompt-dependent leaf controls subscribe directly to the stable draft store; prompt text is not routed through the root controller object.
- Run, send, schedule, save, convert, phrase, and keyboard-shortcut handlers read the current value from the store when invoked.
- Prepared prompts, phrase selection, conversation changes, successful sends, cancellation, and finish use explicit store replacement or clear operations.

## Required behavior

- Normal typing does not render `ActionPopupContent`, the popup controller owner, or unrelated popup sections.
- Blur/flush does not render those owners either.
- `Ctrl+Enter` flushes the editor before the run handler reads the store.
- An externally prepared or selected prompt updates the editor exactly once without replacing the store.
- Failed remote synchronization keeps the draft and reports the existing error.
- Unsent drafts survive popup unmount/remount for both idle and active agent sessions.
- A successfully sent or deliberately cleared draft becomes empty for every subscriber.
- Context or selected-action changes bind to the correct stable store and never write the outgoing prompt into the incoming action.

## Testing implications

- Prompt-store tests cover stable identity, local edits, replacements, clears, revision ordering, remote synchronization, failure retention, and explicit lifecycle cleanup.
- Prompt-component tests preserve blur and keyboard behavior and prove external replacement reaches the mounted editor once.
- Bottom-row tests prove only its prompt-dependent boundary renders for live edits.
- Popup regression tests count renders and prove repeated typing and flushes do not render `ActionPopupContent`.
- Remount tests preserve both idle and active-session drafts.
- Remove controller tests that assert prompt text as controller React state; replace them with store and user-facing behavior tests.

## Acceptance criteria

- [ ] Prompt text, preparation state, and reset counters are absent from popup root/controller React state.
- [ ] One stable draft store is shared by the editor and every prompt-dependent control.
- [ ] The current run/session service no longer owns prompt draft values or prompt-session maps.
- [ ] Typing and flushing do not render `ActionPopupContent` or its controller owner.
- [ ] External replacement does not replace the draft store or remount the editor.
- [ ] Unsent drafts survive popup remount and are removed only by explicit lifecycle rules.
- [ ] Existing run, send, schedule, save, convert, phrase, blur, and shortcut behavior is preserved.
- [ ] App lint and tests pass.

