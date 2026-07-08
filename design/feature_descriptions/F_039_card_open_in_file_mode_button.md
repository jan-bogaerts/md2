---
id: F-039
title: open-in-file-mode button on the desktop card face
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Show a direct "open in file mode" button on the card itself on desktop, as the app-layout design lists among the card's normal-state elements ("button to open in file mode (to full text editor)").

## Current state
On desktop the switch to file mode is only reachable indirectly: through the card's context/actions menu (`ProjectCardView`, `app/src/components/card_view/project_card_view.tsx`) or from the card body dialog. Mobile already has an inline "Open in file mode" button in the expanded card. The design intends one-click access from the card face.

## implementation details
- Add a small icon button (e.g. `mdi-material-ui` `FileDocumentOutline` or `OpenInNew`) to the card header action row in `ProjectCardView`, next to the agent LED and action entry points, calling the existing `onOpenInFileMode(card.path)`.
- `stopPropagation` on click so it does not also open the body dialog; add a tooltip and an aria-label including the card id, consistent with the neighboring buttons.
- Keep the menu items and dialog button as they are; this is an additional entry point, not a replacement.
- Watch header crowding: the action row already holds policy LEDs, Affects, agent LED, action icons and the menu; if it overflows on narrow columns, prefer icon-only rendering (it already is) and rely on the existing wrap behavior.

## acceptance criteria
- On desktop, every card shows the button; clicking it switches to text view with that card opened, without opening the body dialog.
- Mobile behavior is unchanged.
- A component test covers the click (handler called with the card path, dialog not opened).

## see also
- `design\architecture\initial description\app layout.md`
- `design\feature_descriptions\ready\F_005_card_view.md`
