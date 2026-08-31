---
author: 
id: F_206
internalId: a992c823-0635-450a-9f89-af756fdac964
title: Add archive to card popup context menu
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__a992c823-0635-450a-9f89-af756fdac964.json
policy:
after: 10a50270-fcab-4661-9d29-d966aa99eb1e
---
No way to archive cards, add menu item in context menu

Terms used below:

* **archive a card**: move one card file, plus the assets that only that card references, into the project's configured `archivedFolder`, in a single commit that also repairs the ordering links of the cards left behind. The card stops being an active card and becomes a background card. This is not **delete** (which removes the file) and not **release** (which moves a whole set of cards, plus their activity logs, into a named release folder).
* **card menu**: the MUI `Menu` built in `project_card_view.tsx:353`. One menu, two entry points: the three-dots button on the card (`openCardActions`) and right-click on the card body (`openCardContextMenu`, desktop only, suppressed on mobile). It is the menu this feature extends.
* **card details popup**: the separate `CardBodyPopover` that opens when a card is clicked. It is not extended here, but it must be closed when its card is archived.
* **card handlers**: the `CardHandlers` interface (`project_card_view.tsx:28`) that carries board-level callbacks down through `CardColumn` into each card.

## Current state

### The archive operation is finished; nothing in the UI reaches it

`CardArchiveOperations.archiveCard` (`app/src/services/data/card_archive_operations.ts:17`) already implements the whole operation. It flushes pending commits, computes the ordering repair with `computeMove(activeCards, cardPath, 'archived', targetIndex)`, collects the card's exclusively referenced assets with `findArchiveAssetPaths`, builds the file moves into `config.archivedFolder` with `buildCardArchiveMoves`, and commits the moves plus the ordering rewrites as one commit named `Archive <path>`. Afterwards it triggers the configured state actions for the state `archived`, pushes when `pushMode` is `auto`, applies the moves to local state, and reports the new path through `dependencies.cardPathChanged`, so open editors follow the moved file.

Its only caller is `CardOperations.moveCard` (`app/src/services/data/card_operations.ts:308`), which branches into it when `targetStatus` is exactly `'archived'`.

The three callers of `moveCard` cannot produce that status in practice:

* drag and drop (`card_view.tsx:145`, `mobile_card_view.tsx:111`) passes the status of the column the card was dropped on;
* `CardStateSelector` (`card_state_selector.tsx:33`) offers only the states from project config.

Board columns come from configured states as well (`use_card_view_columns.ts`), and `archived` is a folder setting (`project.archivedFolder`), not a state. So unless a project happens to configure a state literally named `archived`, there is no column to drop on and no entry in the state selector. That is the reported gap: the operation exists, the way to invoke it does not.

### The card menu already has the shape this item needs

The menu at `project_card_view.tsx:353` ends with `Open body`, `Open in file mode`, `Attach files`, `Edit title` and `Delete` (line 384). `Delete` is the model to copy: it closes the menu and stores the path in `deleteCardPath` (line 223), which opens `CardDeleteDialog`; confirming calls `onDeleteCard` from the card handlers. That handler is `handleDeleteCard` in `card_view.tsx:156` and in `mobile_card_view.tsx:122`. Both run the data-service call, then clear the workspace selection and close the card details popup by internal ID, and report failures through `dialogService`.

Read-only projects are handled per item with `disabled={readOnly}`, taken from `useProjectReadOnly`.

The same `CardView` component renders on the desktop and the mobile board, so a menu item added there appears in both; only the right-click entry point stays desktop-only.

### Test coverage today

`card_operations.test.ts` covers the operation itself: archiving a card with its asset and the ordering repair in one commit (line 843), and rejecting an existing archive target before committing (line 923). There is no UI test for archiving, because there is no UI.

## Implementation details

* Add `onArchiveCard: (path: string) => Promise<void>` to `CardHandlers`. `CardColumn` spreads its handlers already, so it needs no change.
* Implement `handleArchiveCard` next to `handleDeleteCard` in `card_view.tsx` and `mobile_card_view.tsx`. Read the card and its `internalId` from the snapshot *before* the move, call `dataService.cards.moveCard(path, 'archived', targetIndex)`, then clear the workspace selection for the old path and close the card details popup by that internal ID. On failure, report through `dialogService.error` with fallback `Card archive failed: <path>`, then rethrow, matching delete.
* Compute `targetIndex` as the number of active cards whose status is already `archived`, so the archived card lands at the end of that group. In a normal project that number is `0`.
* Add `CardArchiveDialog` in `app/src/components/card_view/card_archive_dialog.tsx`, mirroring `CardDeleteDialog`: title `Archive card`, the card path in the body, `Cancel` and `Archive` buttons. Use the primary color, not error — archiving is reversible by moving the file back, deleting is not.
* Add the menu item in `project_card_view.tsx` directly above `Delete`: `Archive`, `disabled={readOnly}`, click closes the menu and sets `archiveCardPath`, which drives the new dialog. Render the dialog next to `CardDeleteDialog`.
* Do not change `CardArchiveOperations`, `buildCardArchiveMoves`, or the state selector. This feature adds an entry point only.
* The failure modes the operation already raises — card not loaded, archive target already exists, asset file not loaded — all throw before the commit, so a failed archive leaves the board, the files and the repository unchanged. The user sees one error dialog and the card stays where it was.
* Tests: extend the board-card menu tests so that the menu shows `Archive`, that it is disabled on a read-only project, that cancelling the dialog calls no data service method, that confirming calls `moveCard` with the status `archived`, that the card details popup for that card is closed afterwards, and that a rejected `moveCard` produces a dialog error and leaves the card in place.

## Acceptance criteria

* The card menu shows an `Archive` item directly above `Delete`, both from the three-dots button and from right-click on the card, on the desktop board and on the mobile board (mobile through the dots button only, as today).
* Choosing `Archive` opens a confirmation dialog naming the card path. Cancelling leaves the card, the files and the repository untouched.
* Confirming moves the card file and the assets that only this card references into the configured `archivedFolder`, repairs the ordering links of the remaining cards, and writes all of it as one commit named `Archive <path>`.
* After a confirmed archive the card is gone from its board column, the card details popup for that card is closed, and the workspace selection no longer points at the old path.
* State actions configured for the state `archived` run once for the archived card, and a project with `pushMode: auto` pushes the archive commit.
* On a read-only project the `Archive` item is present but disabled.
* When the operation throws (card not loaded, archive target already exists, asset not loaded), one error dialog is shown, no commit is made, and the board is unchanged.
* Archiving deletes nothing: the card file exists at its new path inside `archivedFolder` after the operation.
* `npm run typecheck` passes; the app unit suite and lint pass.