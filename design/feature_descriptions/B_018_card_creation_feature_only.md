---
id: B-018
title: cards can only be created as features
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The new-card form in `ProjectWorkspace` hardcodes `type: 'feature'` and the button reads "Create Feature". Card types (feature/job/bug + configurable prefixes and colors) are fully modeled in config and naming, but jobs and bugs cannot be created from the UI.

## Fix
- Add a card-type selector to the new-card form, fed from `projectConfig.cardTypes` (label + color swatch), defaulting to feature.
- Button label becomes generic ("Create card") and the created file uses the selected type's prefix via the existing `createCardFile`.
- Longer term the new-card form should move into a dialog opened from the card view ("add card" per column would set the initial status), but the selector is the minimum fix.

## acceptance criteria
- A card of every configured type can be created; the generated filename uses that type's id prefix.
- The type list reflects project config (custom types included), not a hardcoded enum.
- Tests cover creating a job and a bug and the prefix/number generation per type.

## see also
- `design\architecture\initial description\data management.md`
- `design\feature_descriptions\F_008_templates_and_headers.md`
