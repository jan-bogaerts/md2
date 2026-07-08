---
id: F-040
title: card type shown as footnote text on the card
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Complement the card's colored type line with a textual type indicator ("also perhaps as a footnote text on card" in the app-layout design), so the type is readable without memorizing colors and is accessible to color-blind users.

## Current state
`ProjectCardView` (`app/src/components/card_view/project_card_view.tsx`) shows the type only as the 4px colored line on the card's left edge. The type label exists in config (`CardTypeConfig.label`) and the type can be derived from the card id prefix via `getCardType` (`app/src/data/action_context.ts`), but it is never rendered as text.

## implementation details
- Resolve the card's `CardTypeConfig` in `CardColumn`/`ProjectCardView` (the column already resolves the color; pass the whole config or the label instead of only `color`).
- Render the label as a small caption at the bottom of the card content (`Typography variant="caption" color="text.secondary"`), e.g. "Feature". Cards whose id prefix matches no configured type render no footnote.
- Keep it subtle: no extra vertical padding beyond the caption line; mobile and desktop identical.

## acceptance criteria
- A card with id `F-012` and default config shows "Feature" as a footnote; `B-003` shows "Bug"; a card with an unknown prefix shows no footnote.
- Custom card types configured in project config show their configured label.
- A component test covers the three cases above.

## see also
- `design\architecture\initial description\app layout.md`
- `design\feature_descriptions\ready\F_005_card_view.md`
