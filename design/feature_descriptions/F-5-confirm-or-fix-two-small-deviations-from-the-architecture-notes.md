---
id: F-5
title: confirm or fix two small deviations from the architecture notes
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: false
internalId: 36656a01-af3e-47f4-b72b-5fbfdd3520af
---

## Problem
The 2026-07-08 implementation audit found two places where the code deviates from the initial architecture notes. Neither is a defect; both need an explicit decision so the docs and code stop disagreeing.

## Items
- **Icon library**: `design\architecture\initial description\components.md` asks for "react-md / material-icons"; the app uses `mdi-material-ui` (Material Design Icons for MUI). Functionally equivalent and arguably the better fit for MUI v9. Decide: keep `mdi-material-ui` and update the architecture note, or switch libraries (not recommended).
- **Architecture search scope**: `design\architecture\initial description\search.md` sketches architecture files searching "header info only by default, can include description" as its own toggle. The implementation collapsed this into the single `includeBackgroundBody` option (`app/src/services/search/search_types.ts`) covering all background folders (history + architecture together). Decide: accept the single-toggle simplification and update the search note, or add a separate architecture-scope toggle to `SearchOptions` and the search control.

## acceptance criteria
- For each item there is either a doc update recording the accepted deviation or a card/implementation restoring the spec behavior.
- Architecture notes and code no longer contradict each other on these two points.

## see also
- `design\architecture\initial description\components.md`
- `design\architecture\initial description\search.md`
- `design\feature_descriptions\ready\F_017_search.md`
