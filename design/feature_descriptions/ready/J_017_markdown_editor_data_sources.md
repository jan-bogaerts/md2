---
id: J-017
title: drive Markdown editors from data sources instead of hoisted props
status: design
owner: JB
affects:
  - app/src/services/open_files_service.ts
  - app/src/services/open_files_service.test.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor.test.tsx
  - app/src/components/editor/markdown_document_config.ts
  - app/src/components/editor/markdown_document_history_store.ts
  - app/src/components/text_view/text_view.tsx
  - app/src/components/text_view/text_view.test.tsx
  - app/src/components/text_view/use_open_tabs.ts
  - app/src/components/actions/action_editor.tsx
  - app/src/components/actions/use_action_editor_controller.ts
  - app/src/components/card_view/card_body_editor.tsx
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Stop feeding Markdown editors their content through React props that originate in a global store, and stop hoisting one shared `MDXEditor` above every editing surface. Each editing surface owns its own editor instance and pulls content from a `MarkdownDataSource` it also writes back through.

The purpose is responsiveness. Today every `DataService` `'changed'` event — which fires on every editor flush, every agent-conversation update, and every save-state transition — re-renders `ProjectWorkspace`, `TextView`, and the Lexical tree beneath them, even when the edited document is untouched. After this refactor a Markdown editor re-renders only when its own document is genuinely replaced.

This is a structural refactor. Document content, commit batching, undo semantics, dirty tracking, and all persisted data are unchanged.

## Prerequisite

[[J-018]] must be implemented and landed before this feature. J-018 removes aggregate action persistence monitoring from `DataService` and gives card/project data and actions direct owner-specific event paths. `OpenFilesService` and the Markdown data sources defined here must use those direct events; they must not subscribe to action changes forwarded through `DataService`.

## Current architecture

### The hoisted editor

`TextView` owns one lifetime-stable `MarkdownEditor` (`text_view.tsx:442`), rendered inside a `<Box hidden>` and reused for card bodies, action prompts, and action phrases alike. Because the editor sits above every surface that needs it, content has to travel up and back down:

- `ActionEditor` cannot render its own editor, so `use_action_editor_controller` builds a `MarkdownDocumentOwnerConfig` and pushes it **upward** through `onMarkdownDocumentOwnerChange` (`text_view.tsx:293-309`).
- `TextView` maintains two mutable ref maps, `actionMarkdownOwnersRef` and `actionMarkdownDocumentsRef`, plus a mirrored `actionMarkdownOwners` state, to reconcile owners against open tabs (`text_view.tsx:239-251`).
- Card bodies take the other route: `cardMarkdownDocument` is memoised from the snapshot card (`text_view.tsx:347-356`) and writes flow out through `onBodyChange` → `ProjectWorkspace.handleBodyChange` → `dataService.cards.updateCardBody`.
- `renderedMarkdownDocument` falls back to a synthetic `EMPTY_MARKDOWN_DOCUMENT_ID` document so the editor always has something to render.

### The prop-diffing effect

Because content arrives as a prop while the editor is uncontrolled during typing, `markdown_editor.tsx:139-163` reverse-engineers intent from prop deltas. It compares the previous `documentId`/`markdown` against the current pair and against `latestMarkdownRef` to decide between three cases: nothing happened, the document was switched, or the content was replaced externally. This is the single most fragile part of the editor and exists only because the editor is told about changes rather than notified of them.

### Object renewal already exists

`ProjectCard` objects are not produced by `StorageService`, which knows only `MarkdownFile`. Cards are derived in `ProjectState.createSnapshot` (`project_state.ts:111-139`). `reuseUnchangedCard` (`project_state.ts:146-164`) returns the **previously produced card object** whenever content, sha, `isActive`, and conversations are unchanged, and a fresh object only on genuine change. Card object identity is therefore already an exact "this object was renewed" signal. The same holds for `ActionDefinition` objects via `ActionService`.

### Undo history

`MarkdownDocumentHistoryStore` gives one editor instance independent undo stacks per document. It owns a single `sharedHistoryState` (`markdown_document_history_store.ts:31`) handed to `registerHistory(editor, this.sharedHistoryState)` (`:69`). Lexical binds that one `HistoryState` object to that one editor for its lifetime, so per-document undo is emulated by swapping the object's *contents* (`copyHistoryState`) on switch and re-pointing every stack entry's `.editor` (`rebindHistoryState`, `:17-21`).

Retention is currently driven by an effect that recomputes card document IDs and action owner document IDs and calls `retainDocuments` (`text_view.tsx:229-237`). `discardDocument` is called separately when a phrase is deleted (`use_action_editor_controller.ts:163`).

### Open files

`OpenFilesService` tracks paths only. `TextView` separately derives `cardsByPath`, `editorActionsByPath`, and `availablePaths` from the snapshot on every render and feeds `availablePaths` back into `useOpenTabs`, which calls `retainAvailableFiles` from an effect.

## Target architecture

### `MarkdownDataSource`

A read-write interface owned by whoever knows how the document is persisted. It is an `EventTarget`.

```ts
export interface MarkdownDataSource extends EventTarget {
    readonly documentId: string
    getMarkdown(): string
    /** Live, per keystroke. Stages without committing. */
    edit(markdown: string): void
    /** On flush, document switch, blur, or unmount. */
    commit(markdown: string): void
}
```

Events it dispatches:

| Event | Meaning | Editor response |
| --- | --- | --- |
| `markdownReplaced` | The underlying object was renewed with content the editor did not author | `setMarkdown` with the new content, then re-baseline the active history document |
| `documentChanged` | The source now represents a different document (action tab switch) | Flush the outgoing document, switch history, `setMarkdown` |

`documentId` keeps its current meaning and encoding: `JSON.stringify([projectKey, path])` for cards, `JSON.stringify([namespace, actionId, editorDocumentId])` for action prompt/phrase documents.

### Implementations

- **`CardMarkdownDataSource`** — holds the open-file entry for one card. `getMarkdown()` returns `card.content`. `commit()` calls `dataService.cards.updateCardBody(path, markdown)`. `edit()` is a no-op for cards, matching today's behaviour where card bodies are buffered until flush. Emits `markdownReplaced` when `OpenFilesService` reports the card object was renewed with content the source did not write.
- **`ActionMarkdownDataSource`** — holds the open-file entry for one action plus the currently selected tab. `getMarkdown()` returns the selected phrase text or the prompt. `edit()` calls `actionService.stageDraft`, `commit()` additionally calls `actionService.commitDraft` — exactly the split `handleMarkdownEdit`/`handleMarkdownChange` implement today. Emits `documentChanged` when the selected tab changes, and `markdownReplaced` on external draft reload or conflict resolution.

Both call the same service entry points the props path calls today, so `CommitBatcher` scheduling, `hasPendingSave`, `localSaveState`, and the quit-time flush handshake are untouched. Nothing routes around the batcher.

### Echo suppression (required)

Each data source keeps `lastWrittenMarkdown`. When a renewal arrives whose content equals `lastWrittenMarkdown`, the source emits **nothing**. Without this, every flush produces a new card object, which produces `markdownReplaced`, which calls `setMarkdown`, which resets the cursor and clears the undo stack on every save. This is the single most important invariant in the feature and must be covered by tests.

### Editor instancing

Exactly **two** editor surfaces exist, and both are mounted for the whole time the workspace is in list-view mode:

- `CardEditor` (extracted from `TextView`'s inline branch) renders the card editor.
- `ActionEditor` renders its own editor directly, and `MarkdownDocumentOwnerConfig`, `onMarkdownDocumentOwnerChange`, `actionMarkdownOwnersRef`, `actionMarkdownDocumentsRef`, and the `EMPTY_MARKDOWN_DOCUMENT_ID` placeholder are all deleted.

**Invariant: switching tabs never mounts or unmounts an editor.** Both surfaces are rendered unconditionally and toggled with `hidden` — exactly one visible at a time — as the current `<Box hidden>` at `text_view.tsx:441` already does for the single hoisted editor. A tab switch changes which surface is visible and which data source that surface is bound to; it never changes the React tree shape.

This rules out the conditional-branch rendering used today, where `activeAction ? <ActionEditor …> : …` (`text_view.tsx:423-440`) mounts and unmounts `ActionEditor` on every switch between a card tab and an action tab. That branch becomes a `hidden` toggle.

A surface renders whichever data source `OpenFilesService` reports as active for its kind. When no tab of that kind is open, the surface stays mounted and idle rather than unmounting.

### `TextView` survives view switches

The same rule applies one level up. `ProjectWorkspace` currently renders `viewMode === 'cards' ? <CardView …> : <TextView …>` (`project_workspace.tsx:270-313`), so switching to board view unmounts `TextView` and, with it, both editor surfaces and both undo histories — even though the tabs themselves survive, because `OpenFilesService` is a singleton that outlives the view.

That ternary becomes a `hidden` toggle over both views, matching the tab-level invariant: **switching between board and list view never mounts or unmounts `TextView`.** Undo lifetime then equals tab lifetime everywhere, with no second mechanism.

Two consequences to handle:

- **`LeftPanelSlot` must be gated on visibility.** `TextView` portals its file tree into the shell left panel (`text_view.tsx:464`), and `LeftPanelSlot` registers/unregisters the slot on mount/unmount (`left_panel_slot.tsx:14-18`). A permanently mounted `TextView` would keep the file tree in the left panel while board view is showing. Render the `LeftPanelSlot` subtree only while list view is active, so slot registration still follows visibility even though the component does not.
- **Both views stay subscribed.** `CardView` and `TextView` will both be mounted and both subscribed to their stores. This is acceptable only because the data-source work above stops store events from re-rendering editor content; verify the hidden view does not do layout or measurement work while hidden.

Keep the `isProjectOpen` guard as it is: with no project open, neither view is mounted.

### `MarkdownEditor` prop shapes

The component keeps two modes:

- **Data-source mode** — `dataSource` plus presentation props. No `markdown`, no `onChange`/`onDocumentChange`/`onDocumentEdit`. Used by anything backed by a persisted project object.
- **Props mode** — `markdown` + `onChange`, as today, for transient local buffers. `markdown` is demoted to a **mount-time initial value only**; it is no longer read after mount.

`documentId`/`historyStore` move off the public props and are read from the data source in data-source mode.

The effect at `markdown_editor.tsx:139-163` is **deleted**, not bypassed. Data-source mode replaces it with explicit events. Props mode does not need it: both remaining props-mode call sites already perform external replacement through the imperative handle (`action_agent_form.tsx:93`, `new_card_dialog.tsx:128`).

The rule to apply when adding future call sites: **data source for anything backed by a persisted project object, plain props for transient local buffers.**

### `OpenFilesService`

It gains object ownership while keeping its current path-based API surface.

- Subscribes once to `DataService` `'changed'` and `ActionService` `'changed'`.
- For each open path, re-resolves the current `ProjectCard` or `ActionDefinition` and compares by **object identity**.
- Emits a per-file `fileRenewed` event only for entries whose identity actually changed, and `activeFile` only when the active entry changes. A `DataService` event that touches nothing open produces no emission at all. This firehose-to-signal conversion is where the re-render reduction comes from.
- Keeps one `MarkdownDataSource` per open file and exposes it, so surfaces read a stable source object rather than constructing one per render.
- Absorbs `retainAvailableFiles`: it now derives available paths from the services it subscribes to instead of receiving them from `useOpenTabs`. `TextView` stops computing and passing `availablePaths`.
- `syncProject`/`clear` additionally drop data sources and history for the closed project.

`replaceFilePath`, `openFile`, `activateFile`, `closeFile`, and the existing `changed`/`added`/`removed` events keep their current contracts. `DataService.completeActionPathChange` (`data_service.ts:42-49`) continues to work unchanged.

### Undo history ownership

Undo lifetime equals **tab lifetime**: close a tab and its stack is gone; reopen the document and it starts a fresh stack.

There are exactly two stores, one per editor surface. They must be per-instance rather than shared, because `sharedHistoryState` is bound to a single editor via `registerHistory`, so the two concurrently mounted surfaces cannot share one store.

Because neither surface ever unmounts — not on a tab switch, and not on a board/list view switch — each store simply lives as long as its surface, and per-document swapping inside a store handles everything else: card A → card B within the card surface, and prompt → phrase within the action surface. No history has to survive an unmount, so no registry, and no store hoisted above `TextView`.

`attachEditor`'s `rebindHistoryState` pass (`:45`) stays as-is: still correct, no longer on any routine path.

Retention moves off the derived-ID effect and onto `OpenFilesService` events:

- Opening a file registers its document IDs (one for a card, prompt + one per phrase for an action).
- Closing a file discards them.
- `discardDocument` stays for phrase deletion, which kills a document while its file remains open.
- Project switch clears everything via the existing `syncProject`.

`card_body_editor.tsx`'s `key={card.path}` (`:79`) is removed; remounting per card is what destroys undo history there today.

### Call sites

| Call site | Content origin | Change |
| --- | --- | --- |
| `text_view.tsx:442` (card body) | snapshot card | Data-source mode, moved into a `CardEditor` surface |
| `action_editor.tsx` (via owner config) | action draft | Data-source mode, editor rendered locally |
| `card_body_editor.tsx:80` | `card.content` from the snapshot | Data-source mode; drop `key={card.path}` |
| `new_card_dialog.tsx:247` | local `useState` | Unchanged, props mode |
| `action_agent_form.tsx:331` | transient run prompt | Unchanged, props mode |

Props-mode call sites do not re-render from the global store, and the editor ignores the `markdown` prop after mount, so leaving them alone costs nothing.

## Implementation notes

- `handleMarkdownDocumentChange` and `handleMarkdownDocumentEdit` (`text_view.tsx:278-291`) disappear along with the document maps; each data source routes its own writes.
- `handleDiscardMarkdownDocument` (`text_view.tsx:311-315`) moves to the action surface, which now holds its own editor ref.
- `registerMarkdownEditorFlush` and the unmount flush in `markdown_editor.tsx:165-172` stay exactly as they are. Verified: the registry is a `Set` and `flushMarkdownEditors` iterates all entries (`markdown_editor_flush.ts:19`), while each editor's `flush` is a `useCallback` with `[]` deps and so contributes a distinct closure per instance. Going from one mounted editor to several needs no change, and the quit-time handshake keeps flushing every one of them.
- `MarkdownDocumentConfig` and `MarkdownDocumentOwnerConfig` are deleted; `markdown_document_config.ts` is removed if nothing else uses it.
- Keep the `flushOnBlur`, `stickyToolbar`, `hideToolbar`, `readOnly`, `overlayContainer`, `placeholders`, and `toolbarContents` props exactly as they are — they are presentation, not data.
- The action editor's `editorState` reconciliation and draft/conflict handling in `use_action_editor_controller` keep their current behaviour; only the markdown in/out path moves to the data source.

## Acceptance criteria

- Typing in a card body does not re-render `ProjectWorkspace` or `TextView`, and does not call `setMarkdown` on the editor.
- A `DataService` `'changed'` event that renews no open file produces no `OpenFilesService` emission and no editor re-render.
- Saving a card produces no cursor jump and no undo-stack reset (echo suppression).
- An externally renewed card — agent write, external reload — replaces the editor content and re-baselines that document's undo stack.
- Switching action tabs (prompt ↔ phrase) flushes the outgoing document and restores the incoming document's undo stack.
- Switching between an open card tab and an open action tab and back preserves both tabs' undo stacks.
- No tab switch mounts or unmounts an editor: both surfaces stay mounted and only their `hidden` state changes. This is worth asserting directly in a test, since a conditional-branch regression would be invisible except as a performance and undo-history loss.
- Switching list → board → list preserves every open tab's undo stack, and does not remount `TextView`.
- The file tree is absent from the left panel while board view is showing, even though `TextView` remains mounted.
- Closing a tab and reopening the same document yields an empty undo stack.
- Deleting a phrase discards that document's history while the action's other documents keep theirs.
- Commit batching is unchanged: edits still schedule through `CommitBatcher`, `hasPendingSave`/`localSaveState` report as before, and the quit-time flush handshake still flushes every mounted editor.
- Action rename still updates the open tab path (`completeActionPathChange`).
- Project switch clears open files, data sources, and all undo history.
- `new_card_dialog` and `action_agent_form` behave exactly as before.
- The prop-diffing effect at `markdown_editor.tsx:139-163` no longer exists.

## See also

- [[J-018]] — prerequisite extraction of aggregate persistence coordination from `DataService`

- [[F-007]] — the shared Markdown editor surface this refactor restructures
- [[J-005]] — `DataService` collaborator split, whose `'changed'` firehose this filters
- [[F-2]] — `ProjectWorkspace` god component; this removes part of its editor plumbing
