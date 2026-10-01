---
author: 
id: F_393
internalId: 28d05421-63b6-4bda-9701-5bdbd2e81e70
title: Autocommit delay on project config
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__28d05421-63b6-4bda-9701-5bdbd2e81e70.json
policy:
after: 4bcc15e9-9de2-4f17-8df9-40205ed9777c
---

The ´autocommit delay´ option on config dialog´s project tab shows a meaningless value. Improve display, show formatted time value. Also show value whennot sliding

## Current state

* Entry `project.autoCommitDelayMs` (`app/src/services/config/config_entries.ts`): `type: 'number'`, `input: 'slider'`, `min` 1000, `max` 120000, `step` 1000, default 30000. Value unit is milliseconds. It is the only slider entry in `CONFIG_ENTRIES`.
* Project tab renders it in the `Git` group (`PROJECT_CONFIG_GROUPS` in `app/src/components/config/project_config_section.tsx`) through `ConfigValueEditor`.
* `ConfigValueEditor` slider branch (`app/src/components/config/config_value_editor.tsx`): `FormLabel` with `entry.label`, MUI `Slider` with `valueLabelDisplay="auto"`, then `FormHelperText` description. No `valueLabelFormat`, no `getAriaValueText`.
* Result: value bubble only appears while thumb is hovered, focused or dragged, and shows raw milliseconds (`30000`). Screen readers also read `30000`. When idle, no value is visible.
* Existing formatter `formatDuration(ms)` (`app/src/components/actions/conversation/status/conversation_duration.ts`): `m:ss`, or `h:mm:ss` from one hour. Range 1000–120000 gives `0:01` to `2:00`.
* Pattern for formatted slider: `DiagramZoomSlider` passes the same formatter to `valueLabelFormat` and `getAriaValueText`.

## Implementation details

1. `ConfigEntry` (`config_entries.ts`): add optional `valueFormat?: 'duration'`. Meaning: number value is milliseconds and is displayed with `formatDuration`. Set `valueFormat: 'duration'` on `project.autoCommitDelayMs`.
2. `ConfigValueEditor` slider branch:
   * compute display formatter once: `entry.valueFormat === 'duration' ? formatDuration : String`. Import `formatDuration` from `conversation_duration.ts`; do not add a new formatter.
   * pass formatter to `Slider` `valueLabelFormat` and `getAriaValueText`. Keep `valueLabelDisplay="auto"`, so drag bubble shows formatted value.
   * label row: replace lone `FormLabel` with a row (`Stack direction="row"`, `justifyContent="space-between"`): `FormLabel` left, formatted current value right (`Typography`, body2, `text.secondary`). Text is always visible, also when not sliding, and updates live from `value` prop while dragging (draft value).
   * Text value is plain text, not a label: slider accessible name stays `entry.label`.
3. No change to stored value, min/max/step, config persistence, `CommitBatcher`, or other config entries. Slider entries without `valueFormat` show `String(value)` beside label.

Edge cases:

* `disabled` (read-only project): value text still shown, slider disabled as today.
* Value from a hand-edited config not on a 1000 step (e.g. 1500): `formatDuration` floors to whole seconds (`0:01`). Stored value unchanged.
* `formatDuration` clamps negatives to `0:00`; min 1000 prevents this in UI.

Tests (`config_value_editor.grouped.test.tsx`):

* slider entry with `valueFormat: 'duration'` and value 30000: text `0:30` visible without interaction; slider `aria-valuetext` is `0:30`.
* after `fireEvent.change` to 90000 and rerender with new value: text `1:30`.
* slider entry without `valueFormat`: raw value text shown.
* Existing slider tests (bounds, invalid min/max) keep passing unchanged.

## Acceptance criteria

* Config dialog, project tab, Git group: `Auto commit delay` shows current value as `m:ss` (default `0:30`) beside label, without touching the slider.
* While dragging, bubble and beside-label text both show formatted value (e.g. `1:30`), never raw milliseconds.
* Range endpoints display `0:01` and `2:00`.
* Screen reader value text for slider is formatted value.
* Saved config value still in milliseconds; auto-commit timing unchanged.
* Read-only project: value visible, slider disabled.