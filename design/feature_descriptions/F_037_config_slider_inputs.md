---
id: F-037
title: slider input for bounded numeric config values
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 10b049b0-5e47-4985-9c2a-9f8ce9f717bb
---

## Goal
Honor the config design's input guidance: numeric config values with a fixed, manageable range should render as a slider instead of a bare number input.

## Current state
All numeric entries render as a number `TextField` in `ConfigValueEditor` (`app/src/components/config/config_value_editor.tsx`), regardless of whether the entry defines `min`/`max`. The design (`design\architecture\initial description\config.md`) says: "numbers -> number input field or slider when fixed and manageable range".

## implementation details
- Define what "manageable" means as data, not heuristics: add an optional `input: 'slider'` (with optional `step`) to `ConfigEntry` in `app/src/services/config_entries.ts`; only entries that opt in render a slider. Entries must have both `min` and `max` to be eligible (validate in a test).
- In `ConfigValueEditor`, render an MUI `Slider` (with value label) for `type: 'number'` entries carrying `input: 'slider'`; keep the number field for the rest. Description text stays below, same as other editors.
- Slider edits go through the same `setDraftValue` path so save/cancel semantics are unchanged.
- Candidate first user: `react.autoCommitDelayMs` if given a sensible bounded range; otherwise ship the mechanism without converting entries.

## acceptance criteria
- A number entry marked `input: 'slider'` renders a slider bounded by its `min`/`max`, updates the draft, and participates in save/cancel like other values.
- Entries without the marker render exactly as today.
- A test asserts slider-marked entries define both `min` and `max`.

## see also
- `design\architecture\initial description\config.md`
- `design\feature_descriptions\ready\F_016_config.md`
