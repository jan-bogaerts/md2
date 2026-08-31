---
author: 
id: B_169
internalId: dbb1430f-c4ad-46ec-a77e-8de4f98322cd
title: prompt editing broken
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__dbb1430f-c4ad-46ec-a77e-8de4f98322cd.json
policy:
after: 2809caf7-2f00-4484-ba68-18306e01f965
branch: b_169_prompt_editing_broken
changedFiles:
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup.tsx
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_prompt_draft_service.ts
---
this is a critical bug that occurred recently. we did not change anything to it directly, so something else broke this. perhaps because of the component upgrade we did?

when we open an action in the list editor and go to the prompt, it is empty.

## Current state

Agent-action prompts are stored correctly in `ActionService` drafts. `ActionMarkdownDataSource` reads the current draft's `prompt`, and `ActionEditorNavigation` selects that prompt as the active `list-action` Markdown target. `ListActionEditor` owns one lifetime-stable `MarkdownEditor`; the editor starts with no active target while the Definition tab is selected, then should load the prompt when the Prompt tab becomes active.

The installed editor stack is `@mdxeditor/editor` 4.2.1 with Lexical 0.48.0, upgraded by F-218. An isolated real MDXEditor renders prompt text containing placeholders such as `{{card-file}}`, so prompt parsing alone does not explain the empty editor.

Existing action-editor tests pass, including a prompt-load assertion, but the shared test setup replaces `@mdxeditor/editor` with `mdx_editor_stub.tsx`. Those tests verify application wiring against the stub, not startup timing against the installed editor.

The failure boundary is between action-target selection, Markdown history binding, and real MDXEditor initialization. After installing the lockfile versions, the failure is reproducible with `@mdxeditor/editor` 4.2.1: `MarkdownEditor` captures an initial empty target and Markdown value, then the action selects Prompt before MDXEditor's history `postInit` and `MarkdownDocumentHistoryMonitor` subscription. History must attach to the captured initial snapshot so startup reconciliation can switch to Prompt.

The first remaining empty value came from synchronous readback after that switch. MDXEditor 4.2.1 applies `setMarkdown` through a Lexical update, so `getMarkdown` still returns the previous empty value immediately after `setMarkdown` returns. `MarkdownDocumentHistoryMonitor` used that stale readback to replace its correct Prompt baseline with `''`; document switches and external replacements therefore keep the incoming data-source Markdown as their baseline.

The final runtime failure occurred when the lifetime-stable editor mounted before any action was open. React `StrictMode` probes effect cleanup and setup during development. History attachment happened once in the MDXEditor realm's `postInit`, while the React history plugin detached the store during the StrictMode cleanup. Because realm `postInit` did not run again, later Prompt selection threw `Cannot switch Markdown history before editor is attached` and stopped before loading the prompt. History attachment and detachment now share the React plugin lifecycle: a layout effect reattaches the store before the document monitor's passive effect runs. This preserves one mounted editor and makes the StrictMode probe safe.

Here, **target reconciliation** means comparing the editor's bound target with the data source's current active target when monitoring starts, then loading the current target when they differ.

## Implementation details

1. Add a regression test using the installed MDXEditor rather than `mdx_editor_stub.tsx`. Reproduce opening an agent action and selecting Prompt both immediately and after editor initialization. Also cover opening an action whose persisted editor state already selects Prompt.
2. Prove the confirmed order: MarkdownEditor captures its empty initial snapshot, Prompt becomes active, history `postInit` runs, then `MarkdownDocumentHistoryMonitor` subscribes.
3. Attach history to the same captured initial target and Markdown that MDXEditor received. When monitoring starts, reconcile the data source's current target through the normal document-switch path so outgoing content is flushed, incoming Markdown is read from the owning data source, and section-specific undo history is restored. Keep that incoming Markdown as the completed-switch baseline; do not immediately read back the asynchronously updated MDXEditor. Apply the same rule to external Markdown replacement. Do not remount MDXEditor or add polling, delays, revision counters, or a second prompt state.
4. Keep `ActionService` and `ActionMarkdownDataSource` as prompt owners. Do not copy prompt text into React state and do not parse action JSON in the component.
5. `MarkdownDocumentHistoryMonitor` is shared by `list-action`, `list-card`, and `board-card` bindings. If it changes, all three call sites keep their existing behavior and gain only startup reconciliation. Verify card editors do not reload, lose dirty text, or reset undo history when their current target already matches. If investigation instead proves an action-only cause, keep the fix inside the action-editor binding.
6. Preserve one mounted list-action editor and independent prompt/phrase histories. Switching Definition, Prompt, predefined phrases, actions, or list tabs must flush the outgoing target before loading the incoming target. Prompt text must never be written to a phrase or another action.
7. Keep current persistence flow: live edits stage the action draft; blur, document switch, or explicit project flush commits the valid draft through `ActionService` and the existing commit batcher. Invalid prompts remain unsaved and use current dialog/error presentation.
8. Extend focused tests for prompt loading, prompt editing and saving, prompt/phrase switching, action switching, persisted Prompt selection, and the missed-event timing. Run the action-editor test, Markdown history tests, relevant real-editor integration test, app unit tests, and app lint.

## Acceptance criteria

* Opening an agent action and selecting Prompt displays that action's complete stored prompt, including multiline Markdown and `{{...}}` placeholders.
* Prompt loads when Prompt is selected immediately after opening, after editor initialization, or restored from persisted editor state.
* Switching between two actions always displays the selected action's prompt; no empty or previous-action content flashes or remains.
* Switching among Definition, Prompt, and predefined phrases preserves each section's content and independent undo/redo history.
* Editing a prompt updates only that action's `prompt`; blur or document switch commits it through existing action-draft persistence.
* Dirty outgoing prompt text is flushed before another prompt or phrase loads. It cannot overwrite incoming section content.
* Command actions remain unchanged and show no Prompt tab or prompt editor.
* List-card and board-card Markdown editors keep their existing content, dirty-state, switching, and history behavior.
* No polling, timeout-based synchronization, editor remount, duplicate React prompt state, compatibility flag, or silent empty fallback is added.
* Regression coverage exercises the installed MDXEditor for startup timing; stub-only tests are insufficient for this bug.
* Focused tests, app unit tests, and app lint pass.