---
id: J-017
title: drive Markdown editors from data sources instead of hoisted props
status: ready
owner: JB
affects:
  - app/src/services/open_files_service.ts
  - app/src/services/open_files_service.test.ts
  - app/src/services/data/data_service.ts
  - app/src/services/actions/action_service.ts
  - app/src/components/editor/markdown_data_source.ts
  - app/src/components/editor/card_markdown_data_source.ts
  - app/src/components/editor/action_markdown_data_source.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/editor/markdown_editor.test.tsx
  - app/src/components/editor/markdown_editor_state_store.ts
  - app/src/components/editor/markdown_document_history_store.ts
  - app/src/components/text_view/text_view.tsx
  - app/src/components/text_view/text_view.test.tsx
  - app/src/components/text_view/card_editor.tsx
  - app/src/components/text_view/use_open_tabs.ts
  - app/src/components/actions/action_editor.tsx
  - app/src/components/actions/action_editor.test.tsx
  - app/src/components/actions/use_action_editor_controller.ts
  - app/src/components/card_view/card_view.tsx
  - app/src/components/card_view/card_body_popover.tsx
  - app/src/components/card_view/card_body_editor.tsx
  - app/src/components/card_view/card_body_editor.test.tsx
  - app/src/components/project_workspace.tsx
  - app/src/components/project_workspace.test.tsx
policy:
  checkLinting: true
  requireTests: true
internalId: ade374a9-a511-4a2c-88b5-710c51f5447b
---

## Goal

Replace props derived from global snapshots with stable Markdown data sources: they resolve current domain objects, notify editors of document-specific changes, and accept document-aware writes. Each editing binding owns its own editor and undo store.

Result: save-state transitions and unrelated card/action changes no longer replace editor content or re-render editor owners. Document content, commit batching, dirty tracking, undo semantics, and persisted data stay unchanged unless noted here.

## Prerequisite

[[J-018]] must land first — it removes aggregate action persistence monitoring from `DataService`. This feature needs direct owner events instead:

- card/project renewal from `DataService`
- action and action-editor changes from `ActionService`
- persistence state from `ProjectPersistenceService`, only where save presentation needs it

Neither `OpenFilesService` nor a Markdown data source may consume action changes forwarded indirectly through `DataService`.

## Current architecture (problems)

**Hoisted list editor** — `TextView` owns one `MarkdownEditor`, reused for card bodies, action prompts, and action phrases. Action config travels up through `MarkdownDocumentOwnerConfig`, mutable maps, and mirrored React state; card content travels from the project snapshot through props and writes back through `ProjectWorkspace`. The editor is uncontrolled while typing, so it reverse-engineers document switches from `documentId`/`markdown` prop changes, and keeps a synthetic empty document mounted when nothing is active.

**Renewable domain objects** — `ProjectState` reuses a `ProjectCard` object while content/sha/activity/conversations are unchanged, and only creates a new object on genuine renewal. Cards have stable `header.internalId`; paths are persistence addresses, not identity. `ActionService` produces renewable `ActionDefinition`s, but some action-editor-state changes mutate the existing object and still emit `changed` — object identity alone isn't a complete action-tab signal.

**Undo history** — `MarkdownDocumentHistoryStore` swaps independent document histories through one Lexical `HistoryState`, bound to one Lexical editor. It must never be shared by two mounted editor instances.

**Open files** — `OpenFilesService` stores paths; `TextView` separately resolves paths to cards/actions, derives available paths, and pushes them back via `retainAvailableFiles`.

## Terminology

- **Domain object**: renewable `ProjectCard` or `ActionDefinition` produced by its owning service.
- **Open document**: stable wrapper retained for one list-tab lifetime, exposing the latest domain object without using its path as identity.
- **Markdown document ID**: stable identity of one editable Markdown body. Card body ID = `card.header.internalId`. Action prompt/phrase IDs combine namespace, action ID, and stable editor document ID.
- **Binding**: one editor's current Markdown document selection.

```ts
export type MarkdownBindingKind = 'board-card' | 'list-card' | 'list-action'
```

Board and list card selections are separate — opening a board popup does not open or activate a list tab.

## Stable open documents

`OpenFilesSnapshot` contains stable objects only — never paths, ID-only stand-ins, or raw renewable domain objects.

```ts
export interface OpenDocument extends EventTarget {
    readonly kind: 'card' | 'action'
    getObject(): ProjectCard | ActionDefinition
}

export interface OpenFilesSnapshot {
    activeDocument: OpenDocument | null
    documents: readonly OpenDocument[]
}
```

```ts
openDocument(object: ProjectCard | ActionDefinition): OpenDocument
activateDocument(document: OpenDocument): void
closeDocument(document: OpenDocument): void
```

`openDocument` returns and activates the existing wrapper if the object is already open; otherwise it creates one stable wrapper. `added`/`removed` events carry that wrapper; `changed` carries `OpenFilesSnapshot`.

Rules:

- One `OpenDocument` instance per open list-tab lifetime.
- Domain renewal updates `getObject()`'s return value without replacing the wrapper.
- Content renewal emits granular metadata/object events, not a new snapshot.
- Snapshot identity changes only on tab open/close/reorder/activate.
- Open/activate/close use `OpenDocument` objects; public snapshots and events contain no paths.
- File-tree/navigation paths resolve to current domain objects at the system boundary before opening a tab.
- Tab label, current persistence path, and source path all come from `getObject()`.
- Action path rename needs no `OpenFilesService.replaceFilePath` — the open object is unchanged.
- `retainAvailableFiles` is removed; the service reconciles open entries against direct card/action owner events.

Closing an open document discards its list-editor histories. Reopening the same domain object creates a new `OpenDocument` and fresh history.

## Markdown data sources

Data sources represent the card/action collections of their owning services — stable service objects, not one wrapper per card/action and not aliases for renewable domain objects.

```ts
export interface MarkdownDataSource extends EventTarget {
    getMarkdown(documentId: string): string
    edit(binding: MarkdownBindingKind, documentId: string, markdown: string): void
    commit(binding: MarkdownBindingKind, documentId: string, markdown: string): boolean
}
```

Every write includes the outgoing `documentId`, so a tab change can't redirect buffered text into the incoming document. `commit()` returns `true` only when the synchronous domain update was accepted/scheduled; on `false` the editor keeps its last emitted baseline and dirty state for retry, and one failed editor doesn't stop the global flush registry from flushing others.

### Events

```ts
export interface ActiveMarkdownDocumentChangedDetail {
    binding: MarkdownBindingKind
    documentId: string | null
}

export interface MarkdownReplacedDetail {
    documentId: string
    originBinding: MarkdownBindingKind | null
}
```

| Event | Meaning | Editor response |
| --- | --- | --- |
| `activeDocumentChanged` | One binding selected another document or went idle | Flush old ID, load new ID via `getMarkdown`, switch history; `null` leaves editor mounted and idle |
| `markdownReplaced` | Current domain content changed outside this binding | Non-origin binding reloads the matching active ID and re-baselines history |

Editors ignore events for other bindings or inactive documents.

### Card data source

`CardMarkdownDataSource` resolves card bodies by `header.internalId` through current `DataService` snapshot objects.

- `getMarkdown()` returns current `card.content`.
- `edit()` records authorship/dirty coordination only; card bodies stay buffered until commit.
- `commit()` resolves the latest card, reads its current path, and calls the existing card-body persistence entry point.
- `board-card` and `list-card` maintain independent active document IDs.
- Object renewal compares previous/next content — header, save-state, or conversation-only renewal does not emit `markdownReplaced`.

Card paths never form a Markdown document ID: rename preserves identity/history because `internalId` is unchanged. Missing `internalId` fails fast.

### Action data source

`ActionMarkdownDataSource` resolves action drafts and selected prompt/phrase documents through `ActionService`.

- `getMarkdown()` returns prompt/phrase text by full Markdown document ID.
- `edit()` calls `actionService.stageDraft` for the identified prompt/phrase.
- `commit()` stages the identified text, updates phrase editor state when required, then calls `actionService.commitDraft`.
- Prompt uses the stable prompt editor document ID; phrase uses its stable phrase editor identity, never array index.
- Action owner events are inspected for selection changes even when `ActionDefinition` identity is unchanged.
- External draft reload/conflict resolution emits `markdownReplaced` for affected documents.

The full Markdown document ID already encodes action owner identity plus prompt/phrase editor identity — no separate path or phrase index is used.

## Echo suppression and multiple editors

Each data source tracks authored content per Markdown document, not one scalar for the whole source:

```ts
type LastWrittenMarkdown = {
    markdown: string
    originBinding: MarkdownBindingKind
}

const lastWrittenMarkdownByDocumentId = new Map<string, LastWrittenMarkdown>()
```

When renewed content equals the last written content: the originating binding ignores the echo (cursor/undo stay intact); another binding currently showing the same document is replaced and re-baselined (so board and list can't diverge); unrelated bindings receive nothing. Needed because board and list may independently bind the same card while both stay mounted.

## Binding state

Data sources expose three independent current selections:

```ts
interface MarkdownBindingsSnapshot {
    activeBoardCardDocumentId: string | null
    activeListCardDocumentId: string | null
    activeListActionDocumentId: string | null
}
```

- Opening/closing a board popup changes only `board-card`.
- Activating a list card tab changes `list-card`.
- Activating an action tab or selecting prompt/phrase changes `list-action`.
- Switching the visible list tab from card to action leaves the hidden `list-card` binding's document/history untouched.
- No binding uses `activePath`.

The active list tab remains an `OpenDocument` in `OpenFilesSnapshot`; visibility derives from its `kind`, while editor document selection comes from binding events.

## Editor modes

`MarkdownEditor` keeps two explicit modes.

**Data-source mode** — for persisted project Markdown. Receives stable source, binding kind, binding-owned history store, and presentation props; never `markdown`, `onChange`, `onDocumentChange`, or `onDocumentEdit`.

```ts
interface MarkdownEditorDataSourceProps extends MarkdownEditorPresentationProps {
    binding: MarkdownBindingKind
    dataSource: MarkdownDataSource
    historyStore: MarkdownDocumentHistoryStore
    stateStore: MarkdownEditorStateStore
}
```

Document ID and content come from binding/source events. The editor stays mounted when binding becomes `null`; it flushes outgoing content and goes idle without a synthetic domain document. The prop-diffing effect is deleted, replaced by source-event subscription.

**Props mode** — only for transient local buffers (`new_card_dialog`, `action_agent_form`). `markdown` is mount-time initial content; external replacement still goes through `MarkdownEditorHandle.setMarkdown()`.

Presentation props unchanged: `flushOnBlur`, `stickyToolbar`, `hideToolbar`, `readOnly`, `overlayContainer`, `placeholders`, `toolbarContents`.

## Editor instances and history ownership

Each binding kind owns its own `MarkdownDocumentHistoryStore` — stores belong to editor bindings, never shared data sources: `board-card` for the board popup editor, `list-card` for the persistent list card editor, `list-action` for the persistent list action editor. No store is attached to two Lexical editors concurrently.

List view has two lifetime-stable editor surfaces: `CardEditor` owns the `list-card` editor/store, `ActionEditor` owns the `list-action` editor/store. Both mount for the full `TextView` lifetime and toggle with `hidden` — switching list tabs never mounts/unmounts either. Remove `key={activeAction.id}` and all hoisted owner configuration/maps.

The board popup uses `board-card` binding and its own store, switching explicitly when another card opens (never via a renewed `card` prop). Closing the board binding flushes it and applies board-popup history lifetime independently from list tabs.

List history lifetime equals list-tab lifetime:

- opening creates histories lazily by Markdown document ID
- closing discards IDs no longer owned by any open document
- phrase deletion discards only that phrase ID
- path rename changes no history
- project switch clears every store
- close + reopen starts fresh even though domain document ID is stable

History retention reconciles final open Markdown document-ID sets; it never discards from an intermediate path-level `removed` event.

## Dirty and saved presentation

Dirty buffer state is per editor instance, not shared data-source state. Add a small external store:

```ts
export class MarkdownEditorStateStore extends EventTarget {
    getSnapshot(): boolean
    setDirty(dirty: boolean): void
}
```

It emits only when the boolean changes. The editor sets dirty on first local edit and resets after commit, document replacement, or document switch.

A leaf status component subscribes via `useSyncExternalStore` and combines editor dirty state with existing pending-file-save state. `CardBodyPopover` holds no dirty React state, so keystrokes re-render only the status leaf, not the popup parent.

## `TextView` and view lifetime

`ProjectWorkspace` keeps `CardView` and `TextView` mounted while a project is open, toggling with `hidden` — so `TextView` preserves both list editor instances/stores across board/list switches.

`LeftPanelSlot` stays conditional on list visibility so board view shows no file tree. Hidden editor surfaces do no layout/measurement work.

`ProjectWorkspace` passes an explicit `visible` prop to both views. A view becoming hidden closes/resets all transient UI it owns. Every portaled surface also gates `open` with `visible` (MUI portals render outside the hidden subtree) — applies to: board card-body popover and its delete dialog, affects dialog, list card-properties popover, list agent popup, drag overlay/active drag state.

Hiding board view closes its card-body popup, flushing the `board-card` editor before unmount. Hiding list view closes only transient overlays; both list editors remain mounted.

The no-project guard is unchanged: neither view mounts without an open project.

## Service subscriptions after J-018

- `OpenFilesService` and `CardMarkdownDataSource` subscribe to direct project/card renewal from `DataService`.
- `OpenFilesService` and `ActionMarkdownDataSource` subscribe directly to `ActionService`.
- Neither subscribes to generic persistence events.
- J-018 guarantees `DataService` no longer forwards `ActionService` changes, so one action change causes one action reconciliation.
- Constructors only register services; explicit idempotent initialization attaches owner subscriptions once.

## Call-site changes

| Call site | Change |
| --- | --- |
| `text_view.tsx` card body | Move into persistent `CardEditor`; use `list-card` data-source mode |
| `action_editor.tsx` | Render local persistent Markdown editor; use `list-action` data-source mode |
| `card_body_editor.tsx` | Use `board-card` data-source mode; remove `key={card.path}` and body/dirty prop routing |
| `new_card_dialog.tsx` | Keep props mode |
| `action_agent_form.tsx` | Keep props mode and imperative reset |
| `use_open_tabs.ts` | Consume stable `OpenDocument` snapshot; remove available-path retention |
| `project_workspace.tsx` | Keep both views mounted; provide visibility gating |

Delete `MarkdownDocumentConfig`, `MarkdownDocumentOwnerConfig`, action Markdown owner maps, synthetic empty document, and hoisted Markdown change/edit handlers once no call sites remain.

`registerMarkdownEditorFlush` stays a set of per-instance callbacks; quit-time flush still flushes every mounted editor.

## Error handling

Data sources own synchronous write-error reporting, since persistence callbacks no longer route through React parents.

- Wrap card/action `edit`/`commit` domain calls at the data-source boundary.
- Report failures through `dialogService.error` with the same operation/path context current callers use.
- A failed `commit` returns `false`, keeps editor dirty state, and does not update last-written echo state or advance the emitted baseline.
- A successful synchronous schedule returns `true`; later commit-batch failure stays visible through pending persistence state and existing `ProjectPersistenceService` handling.
- No React error state, and no routing errors back through `ProjectWorkspace`.
- Tests cover both synchronous data-source failure and asynchronous commit-batch failure.

## Acceptance criteria

- J-018 is implemented first.
- Open-files snapshot/events contain stable `OpenDocument` objects, never paths or raw renewable domain objects.
- Card Markdown document ID is `header.internalId`; file rename preserves identity and history.
- Every action edit/commit includes the full outgoing Markdown document ID; prompt text can't overwrite an incoming phrase.
- Echo tracking is per Markdown document, preserving originating cursor/undo while syncing another bound editor.
- Board card, list card, and list action bindings are independent and nullable.
- No list tab switch mounts or unmounts either list editor.
- A binding going idle leaves its editor mounted without a synthetic domain document.
- Data-source mode has no `markdown` or change callbacks; the prop-diffing effect no longer exists.
- Saving a card does not call `setMarkdown` on the originating editor.
- External replacement reloads only matching active documents and re-baselines their histories.
- Action prompt/phrase switching flushes the outgoing ID and restores the incoming history.
- Card/action list-tab switching preserves both list histories.
- Board/list view switching preserves list histories and does not remount `TextView`.
- File tree is absent from the left panel in board view.
- Closing/reopening a list document starts fresh history; phrase deletion discards only that phrase's history.
- Dirty keystrokes re-render only the leaf status subscriber, not popup/editor parent.
- Commit batching, pending-save state, and quit-time flush remain unchanged.
- Synchronous data-source write failure surfaces via `dialogService`, leaves the editor dirty, and doesn't block other editors from flushing.
- Action rename retains the open document and histories without path replacement in `OpenFilesService`.
- Project switch clears open documents, bindings, and histories.
- Transient props-mode editors behave as before.
- Data-source commit failures still reach user-visible error reporting.
- Switching views closes all transient overlays owned by the hidden view; no portaled UI remains visible or interactive.

## See also

- [[J-018]] — required persistence-coordinator extraction
- [[F-007]] — shared Markdown editor behavior restructured here
- [[J-005]] — DataService collaborator split
- [[F-2]] — ProjectWorkspace responsibility reduction
