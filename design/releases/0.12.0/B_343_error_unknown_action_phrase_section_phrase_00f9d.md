---
author: 
id: B_343
internalId: a06f0f67-81e6-428d-85bb-d90688e44d4c
title: Error: Unknown action phrase section: phrase-00f9d
status: ready
owner: 
affects:
agents:
  - design/releases/0.12.0/card__a06f0f67-81e6-428d-85bb-d90688e44d4c.json
policy:
sentryBaseUrl: https://sentry.io
sentryIssueId: 154937872
sentryOrganization: elastetic
after: 495dac3d-c52b-4ae4-bae5-765b7434e0f6
changedFiles:
  - app/src/components/actions/editor/action_phrase_editor_state.node.test.ts
  - app/src/components/actions/editor/action_phrase_editor_state.ts
  - app/src/components/actions/editor/use_action_editor_controller.test.ts
---

## Sentry issue

**Title:** Error: Unknown action phrase section: phrase-00f9d704-009b-4a5a-b513-05c0afc48951

**Message:** Not provided

**Link:** [Open issue in Sentry](https://elastetic.sentry.io/issues/154937872/)

**First seen:** 2026-10-20T15:30:15Z

**Last seen:** 2026-10-20T15:30:15Z

**Occurrences:** 1

**Release:** Not provided

**Environment:** production

**Culprit:** Xd(/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js)

**Event ID:** 1366763f86d44bc9981268ff9e6e2d56

### Application stack frames

- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:856:10921` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:856:7058` — OR
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:856:6371` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:856:7207` — kR
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:882:16309` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:847:41772` — HQe.pub
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:847:41524` — HQe.pubIn
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:882:19781` — unknown function
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:2592:17697` — Object.onChange
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:25:48047` — e.edit
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:25:47574` — Zd
- `/C:/Users/janbo/AppData/Local/Programs/desktop/resources/app.asar/desktop/renderer/assets/index-B84YnJpl.js:25:47374` — Xd

## Current state

* Phrase tabs are identified by a transient `phrase-<uuid>` identity stored in `action.editorState.phrases`, together with a snapshot of the phrase (`text`, `title`).
* `reconcileActionPhraseEditorState` (`app/src/components/actions/editor/action_phrase_editor_state.ts`) runs on every render of `useActionEditorController` and pairs identities with draft phrases by comparing content (`text` and `title`). A phrase without a content match gets a new identity, and a selected phrase tab that no longer exists falls back to `prompt`. The controller effect then publishes the result through `actionService.setActionEditorState`.
* Typing in a phrase body (`ActionMarkdownDataSource.edit`) or title (`handlePhraseTitleEdit`) only calls `draftStore.stageDraft`, which sends no event. The `editorState` snapshot is only synced on commit (`ActionMarkdownDataSource.updatePhraseEditorState`, `handlePhraseTitleCommit`) or tab change. During typing, the draft phrase and its snapshot differ.
* Any re-render during typing makes the edited phrase lose its identity. A confirmed trigger is the save of an earlier commit finishing: `ActionDraftStore.queueDraftSave` and `acknowledgeDraftPersistence` call `dispatchDraftChanged`, and the controller re-renders against the newer staged text.
* `MarkdownEditor` still holds the old target. The next keystroke calls `ActionMarkdownDataSource.edit`, `requirePhrase` throws `Unknown action phrase section`, and `dialogService.error` reports it to Sentry through `telemetryService.captureError`. This matches the Sentry stack (editor `onChange` → `edit` → `updatedDefinition` → `requirePhrase`).
* The fallback switch to the Prompt tab also fails: `prepareDocumentSwitch` calls `flush`, which commits to the stale target and throws the same error, so the switch is aborted. The editor stays bound to the stale identity and reports an error on every keystroke.

## Implementation details

1. `reconcileActionPhraseEditorState`: replace the single content-matching pass with three passes over the draft phrases. Each current entry is used at most once.
   1. Same index with equal content keeps the entry at that index.
   2. Remaining phrases take the first unused entry with equal content (keeps current reorder and duplicate behavior).
   3. Remaining phrases take the first unused entry in order (the phrase was edited, not replaced). Only when no unused entry is left does a phrase get a new identity.
   * Returned entries keep their stored `phrase` snapshot; the snapshot is still updated on commit and tab change. The existing `unchanged` check (identity and selected tab only) then returns `current`, so no `setActionEditorState` is published while typing.
2. Call sites: `useActionEditorController` render and `handleAddPhrase`. Both get the new behavior. In `handleAddPhrase` the appended empty phrase has no unused entry left, so it still gets a new identity.
3. No changes in `ActionMarkdownDataSource`, `MarkdownEditor`, or `ActionDraftStore`.

Edge cases:

* Phrase edited to equal another phrase's content: pass 1 keeps the other phrase on its own identity, pass 3 keeps the edited phrase on its own identity.
* External reload that changes content and count at the same time: unchanged phrases match by content; changed or new phrases take leftover entries in order or new identities. The selected tab falls back to `prompt` only when its identity is gone.
* External change that edits one phrase and reorders others: content-matched phrases keep their identities, and the edited phrase takes the leftover entry.

Tests:

* `action_phrase_editor_state.node.test.ts`: existing reorder, duplicate, insert, delete, and selection tests keep passing. Add: an edited phrase keeps its identity and the selected tab; editing a phrase to equal another phrase's content keeps both identities; with one phrase edited and another inserted, the inserted phrase gets a new identity.
* `use_action_editor_controller.test.ts`: regression test. Select a phrase, stage an edited body through `actionMarkdownDataSource.edit`, dispatch a draft-changed event, then assert the selected phrase identity and `markdownTarget` are unchanged and no `dialogService.error` was reported.

## Acceptance criteria

* Typing in a phrase body or title while an earlier save completes does not report `Unknown action phrase section`.
* The phrase tab stays selected while typing; the editor does not switch to the Prompt tab.
* Phrase body and title edits are saved to the correct phrase.
* Adding, deleting, and reordering phrases keep the current tab and identity behavior.
* Duplicate phrases keep distinct tabs.