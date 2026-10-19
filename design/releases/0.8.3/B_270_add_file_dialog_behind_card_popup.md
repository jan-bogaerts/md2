---
author: 
id: B_270
internalId: bc03f0a4-0b04-4e1e-bbc1-f8b6ae264c4c
title: add file dialog behind card popup
status: ready
owner: 
affects:
agents:
  - design/releases/0.8.3/card__bc03f0a4-0b04-4e1e-bbc1-f8b6ae264c4c.json
policy:
changedFiles:
  - app/src/components/editor/attachments/attachment_choice_dialog.grouped.test.tsx
  - app/src/components/editor/attachments/attachment_choice_dialog.tsx
  - app/src/components/resizable_popper.tsx
after: 04b4a3a2-45cc-425c-bc43-6c46a294447c
---

when adding a file to a card in the card-popup, we no longer show the dialog properly, it is behind the card. this is not correct.

## Current state

Terms:

* card popup: one `CardBodyPopoverEntry` (`app/src/components/card_view/card_body_popover.tsx`), rendered in a `ResizablePopper` (`app/src/components/resizable_popper.tsx`).
* popup stack: `cardPopupService` entries (`app/src/services/card_popup_service.ts`). Holds all popup kinds: `card-details`, `action`, `sequence`. `activate(id)` moves the focused entry to the end.
* stack position: entry index in the popup stack. Popper z-index = `theme.zIndex.modal + stackPosition` (1300 + index).
* attachment choice dialog: `AttachmentChoiceDialog` (`app/src/components/editor/attachments/attachment_choice_dialog.tsx`), MUI `Dialog` asking "Copy into project" / "Link without copying".

Causal chain:

1. User clicks the paperclip in the card popup toolbar (`CardPopupToolbarControls` → `MarkdownAttachmentControl`) and picks files in the native OS picker. The native picker itself is not affected.
2. `CardBodyEditor.handleAttachments` calls `attachFilesToCardMarkdown`, which calls `attachmentChoiceService.choose(files)` and waits for the choice.
3. `AttachmentChoiceDialog` opens. It is mounted once in `project_workspace.tsx`, outside every popper, so it uses the default theme z-index `theme.zIndex.modal` (1300).
4. Card popup z-index is 1300 + stack position. Card popup focus calls `cardPopupService.activate`, so the card popup the user works in is the last entry. With two or more popups open (any kind), its stack position is ≥ 1, its z-index ≥ 1301, and it covers the dialog and its backdrop.
5. With exactly one popup (stack position 0), both are 1300; the dialog only shows on top because its portal is appended to `document.body` later. Fragile.

Result: dialog waits for input but is hidden behind the card popup. Attach flow appears stuck.

`ResizablePopper` already raises `theme.zIndex.modal` for MUI overlays rendered inside the popper (`overlayTheme`, `OVERLAY_LAYER_OFFSET`). The attachment dialog does not benefit, because it is rendered at workspace level.

Not in scope, same cause: `CardDeleteDialog` is rendered next to (not inside) the popper and can also end behind a card popup at stack position ≥ 1. The new card dialog attach path (`new_card_attachment_workflow.ts`) uses the same `AttachmentChoiceDialog` and gets the fix for free.

## Implementation details

* `resizable_popper.tsx`: export `OVERLAY_LAYER_OFFSET`, so the dialog reuses the popper layering constant instead of a new magic number.
* `attachment_choice_dialog.tsx`:
  * Subscribe to the popup stack depth with `useSyncExternalStore(subscribeCardPopups, getPopupCount)`. `getPopupCount` returns `cardPopupService.getSnapshot().length` (primitive, module-level function).
  * Set `Dialog` root z-index to `theme.zIndex.modal + popupCount + OVERLAY_LAYER_OFFSET` via `sx`. This exceeds the top popup (`modal + popupCount - 1`) and that popup's nested overlays (`modal + popupCount`).
  * With no popups open: `modal + OVERLAY_LAYER_OFFSET`. Still above normal content; no behavior change.
* No change to `attachmentChoiceService`, `attachment_workflow.ts`, or `ResizablePopper` stacking logic.

Edge cases:

* Popup opened or closed while dialog is open: z-index follows the stack count through the subscription.
* Multiple card popups, attach from a lower one: focus activates it first, so it becomes top entry; dialog stays above all popups regardless.
* Mobile: popups are full height; same z-index rule applies.

## Acceptance criteria

* Attaching files from a card popup shows the attachment choice dialog above the card popup and its backdrop, with one popup open and with several popups (card, action, sequence) open.
* Dialog buttons ("Cancel", "Link without copying", "Copy into project") are clickable while the card popup stays open; chosen action inserts the attachment link into that card.
* Attaching from the new card dialog and from non-popup editors still shows the dialog as before.
* Tests in `attachment_choice_dialog.grouped.test.tsx`:
  * with N popup entries in `cardPopupService`, dialog root z-index is greater than `theme.zIndex.modal + N`.
  * with no popup entries, dialog renders and resolves the choice as before.
* Existing attachment tests (`attachment_workflow.service.test.ts`, `new_card_dialog_attachment.grouped.test.tsx`, `card_view.test.tsx`) still pass.