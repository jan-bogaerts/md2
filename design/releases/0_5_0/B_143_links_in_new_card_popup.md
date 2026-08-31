---
author: 
id: B_143
internalId: 389dd95e-e4b1-460c-8171-db15ce961115
title: links in new card popup
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__389dd95e-e4b1-460c-8171-db15ce961115.json
policy:
after: 6ec1718f-1770-4446-92e5-c23a0c37da7d
---
when in the 'new card popup', and the cursor is on a link, we show a popup that allows the user to follow that link. but it is hidden behind the main popup which is annoying.

## Current state

The **new card popup** is `NewCardDialog` (`app/src/components/shell/project/new_card_dialog.tsx`), a MUI `Dialog`. MUI mounts a dialog's content inside a `Modal` root with `z-index: 1300` (the theme's `modal` layer), positioned `fixed`, so it and everything behind it visually sits above ordinary page content.

The dialog's description field renders `NewCardMarkdownEditor` → `MarkdownEditor`, which is `@mdxeditor/editor` configured with `linkPlugin()` and `linkDialogPlugin()` (`app/src/components/editor/markdown_editor.tsx:362-363`). When the text cursor sits on a link, MDXEditor's `LinkDialog` component shows a small **link-follow popup**: a Radix `Popover` with a link preview, an edit button, and a copy button.

That popup is not portaled to `document.body`. MDXEditor renders `RadixPopover.Portal` with `container: editorRootElementRef.current` (`@mdxeditor/editor` `LinkDialog.js`), i.e. the popup is appended inside the editor's own root element, which lives inside the dialog's DOM subtree. The popup content class (`_linkDialogPopoverContent_*`) has no explicit `z-index` in the library's stylesheet, so it stacks at the default level of its nearest ancestor stacking context — the dialog's own subtree — rather than above the dialog's `z-index: 1300` modal layer. Result: the link-follow popup paints behind the new card dialog and is invisible/unreachable to the user.

## implementation details

- Target the popup's actual DOM wrapper, not MDXEditor's internal hashed CSS module classes (those are content-hashed and may shift across library versions). Radix Popover content renders inside a `[data-radix-popper-content-wrapper]` element; scope a CSS rule to that selector within the new card editor's container and raise its `z-index` above MUI's modal layer (`theme.zIndex.modal`, 1300), e.g. `theme.zIndex.modal + 1` or higher, matching (or exceeding) any tooltip/popover already layered above dialogs elsewhere in the app.
- Apply the fix as a scoped style (e.g. within the `sx` already used for `.mdxeditor-content` in `new_card_dialog.tsx`, or a shared style used by both the new-card editor and the regular card editor) rather than a global override, so it does not unintentionally change stacking for popups used outside a dialog context.
- Verify the same link-follow popup used inside the regular (non-dialog) card editor is unaffected — it currently works because there is no competing `z-index: 1300` ancestor there.
- Confirm visually in a running app that the popup now paints above the new card dialog's title, description field, and footer, and that its position (anchored to the link under the cursor) is unchanged.

## acceptance criteria

- With the new card popup open, placing the cursor on a markdown link shows the link-follow popup fully visible and on top of the dialog, not clipped or hidden behind it.
- The link-follow popup's preview link, edit button, and copy button remain clickable/usable while the popup is shown inside the new card dialog.
- The link-follow popup in the regular (non-popup) card editor continues to display and behave exactly as before.
- No other dialog, tooltip, or popover in the app visually regresses (gets hidden behind another dialog) as a result of the change.