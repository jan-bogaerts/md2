---
id: F-025
title: card and file deletion
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: c9bfa08f-4942-4fd7-9f4f-12e9a7fa10a8
---

## Goal
Support removing markdown files from the app (overview.md: "App can create/edit/remove markdown files"): delete a card from the card view and a file from the text view, through both storage backends, with confirmation and correct ordering repair.

## Current state
No delete path exists anywhere: `StorageService` has no delete operation, `DataService` has no `deleteCard`/`deleteFile`, and neither the card UI nor the file tree offers a delete affordance.

## implementation details
- Add `deleteFile(path)` to the `StorageService` contract: GitHub uses the contents DELETE endpoint (requires current sha); local Git removes the file and stages the deletion (`git rm`) through the Electron bridge.
- Add `DataService.deleteCard(path)`: flush pending commits for that file, repair the `after` chain (the follower of the deleted card inherits the deleted card's `after`), commit the deletion plus the ordering repair together, push per push mode, and refresh the snapshot.
- UI: a delete command on the card (context/overflow menu and body dialog) and on file leaves in the text tree; always confirm before deleting, showing the file path.
- Close any open text-view tab for the deleted path and clear selection state referencing it.
- Deleting a card with agent log references leaves the log files in place (they live outside the working folder) but the references disappear with the card.
- Fail clearly when the file changed remotely (GitHub sha mismatch) instead of silently overwriting the conflict.

## acceptance criteria
- A card can be deleted from card view after confirmation; its file is removed from the repository via commit (and push in auto mode).
- A file can be deleted from the text view tree; its open tab closes.
- The `after` ordering of the remaining cards in the column stays intact after deletion.
- Deletion works in both GitHub and local Git modes.
- A failed delete (conflict, network, git error) shows a clear error and leaves the snapshot unchanged.
- Tests cover storage delete for both backends, ordering repair, tab cleanup and confirmation flow.

## see also
- `design\architecture\initial description\overview.md`
- `design\feature_descriptions\F_002_data_management.md`
- `design\feature_descriptions\F_005_card_view.md`
