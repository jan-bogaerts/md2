---
author: 
id: B_133
internalId: af16c33d-206a-4cbc-8ca9-488574f7d514
title: Height description new card popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__af16c33d-206a-4cbc-8ca9-488574f7d514.json
policy:
after: 9755a9b8-8161-499f-9020-bd0c53fe17c0
---
We recently updated ´new card´ popup. There is more room for the editor now, but when on small screens, it is not used fully. the popup is stretched full screen in this size mode, but the markdown editor doesn't appear to adjust.

Let editor use available height.

## Current state

`NewCardDialog` renders `fullScreen={isMobile}` on small screens, stretching the dialog to `100dvh`. The form Box inside uses `height: '100%'` on mobile. `DialogContent` is already a flex column with `flex: 1` and `minHeight: 0`, so it grows to fill remaining vertical space between the `DialogTitle` and `DialogActions`.

However, the description Box wrapping `NewCardMarkdownEditor` has a hardcoded `height: 260` and `minHeight: 260` on mobile (270 on desktop). That fixed size prevents the editor from expanding to use the space `DialogContent` makes available. The inner `.mdxeditor-content` element also has `minHeight: 258` on mobile, which is relative to the fixed container, not to viewport.

Desktop is unaffected: the dialog is `height: auto` and a fixed 270 px editor height is appropriate.

## Implementation details

- In the description Box inside `new_card_dialog.tsx`, change `height` and `minHeight` from the fixed `isMobile ? 260 : 270` values to `flex: 1` + `minHeight: 0` on mobile, keeping the fixed `270` / `minHeight: 270` on desktop. This lets the Box stretch inside the flex `DialogContent`.
- The `Stack` that wraps that Box must also grow on mobile: add `flexGrow: 1` and `minHeight: 0` to the Stack's `sx` when `isMobile` is true, so the growth propagates from `DialogContent` down to the Box.
- Remove or replace the `minHeight` on `& .mdxeditor-content` for the mobile case: a fixed pixel value is no longer meaningful when the container is fluid. Set it to `100%` on mobile so the editor content area fills the Box.
- Desktop layout (`height: 270`, `minHeight: 270`, `resize: vertical`, `.mdxeditor-content` `minHeight: 268`) stays unchanged.
- No changes to `NewCardMarkdownEditor` or `MarkdownEditor` are required.

## Acceptance criteria

- On mobile (breakpoint `< md`), the markdown editor expands to fill all vertical space remaining after the header, title field, type-pill row, and footer. No empty gap appears below the editor.
- On desktop, the editor retains its fixed 270 px height and vertical resize handle.
- The mobile dialog itself does not scroll; the editor container scrolls internally if content exceeds its height.
- Desktop layout is pixel-identical to before this change.
