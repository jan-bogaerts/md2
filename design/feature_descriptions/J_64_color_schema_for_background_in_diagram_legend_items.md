---
author: 
id: J_64
internalId: e3024124-3c82-4b0d-9af0-e50cb93cf995
title: color schema for background in diagram legend items
status: ready
owner: 
affects:
agents:
  - design/activity/card__e3024124-3c82-4b0d-9af0-e50cb93cf995.json
policy:
changedFiles:
  - app/src/components/color_picker_button.test.tsx
  - app/src/components/color_picker_button.tsx
  - app/src/components/color_picker_field.test.tsx
  - app/src/components/color_picker_field.tsx
  - app/src/components/color_picker_palette.ts
  - app/src/components/diagram_view/formatting/diagram_formatting_popover.test.tsx
  - app/src/components/diagram_view/formatting/diagram_formatting_popover.tsx
---

The legend on the diagrams allows for configuration. one of the configs that can be changed, is the background. Currently however, the color picker component proposes a set of hard colors which are not ideal for backgrounds. Can we replace them with their softer counter parts?

## Current state

* "Background" = `Fill color` field in `NodeFormattingPopover` (`app/src/components/diagram_view/formatting/diagram_formatting_popover.tsx`). Opened from Format action on legend entry row (`app/src/components/diagram_view/legend/diagram_legend_entry_row.tsx`). Popover only used there.
* `Fill color` renders `ColorPickerButton` (`app/src/components/color_picker_button.tsx`). Button opens `ColorPickerField` (`app/src/components/color_picker_field.tsx`).
* `ColorPickerField` always shows swatches from `COLOR_PICKER_PALETTE` (`app/src/components/color_picker_palette.ts`): 16 saturated hues (MUI 600–800 shades) + 6 neutrals black to white. No way to pass other swatches.
* Saved value: hex string in `DiagramNodeRoleFormatting.box.fillColor`. `diagramRoleStyle` (`app/src/components/diagram_view/formatting/diagram_role_style.ts`) applies it as `bgcolor` on legend sample and canvas node (`app/src/components/diagram_view/rendering/diagram_node.tsx`).
* Other `COLOR_PICKER_PALETTE` users, all must keep hard swatches: node `Font color`, node `Border color`, connection `Font color` / `Line color` (`diagram_connection_formatting_popover.tsx`), markdown section color, column color, card type color, theme settings.
* App has light and dark theme (`app/src/theme/app_theme.ts`). Dark `background.paper` = `#1a212b`, default dark text = `#e6eaf0`.

## Implementation details

Scope: `Fill color` picker in `NodeFormattingPopover` only. Theme-aware soft palette: swatch set depends on active theme mode when popover opens.

1. `app/src/components/color_picker_palette.ts`: add two constants, same order as `COLOR_PICKER_PALETTE` (16 hues, then 6 neutrals):
   * `COLOR_PICKER_SOFT_LIGHT_PALETTE`: MUI 100 shade per hue, light neutrals.
     `#ffcdd2 #ffccbc #ffe0b2 #fff9c4 #f0f4c3 #dcedc8 #c8e6c9 #b2dfdb #b2ebf2 #b3e5fc #bbdefb #c5cae9 #d1c4e9 #e1bee7 #f8bbd0 #cfd8dc`, neutrals `#bdbdbd #e0e0e0 #eeeeee #f5f5f5 #fafafa #ffffff`.
   * `COLOR_PICKER_SOFT_DARK_PALETTE`: each hard hue mixed 30% over dark paper `#1a212b` (precomputed hex, no runtime blending), dark neutrals.
     `#52252c #572d26 #5c3c1e #5e512c #474d2b #31472f #203d2d #124043 #124450 #13405d #1a3b5d #232d51 #2e2753 #3d2251 #4c1e39 #2b3843`, neutrals `#10151c #1a212b #232b36 #2a3441 #343e4c #3e4958`.
   * Hex values = proposal; tune visually during implementation, keep counts and order.
2. `ColorPickerField`: add optional prop `palette?: readonly string[]`, default `COLOR_PICKER_PALETTE`. Swatch loop uses `palette`. Selected-swatch check unchanged.
3. `ColorPickerButton`: add optional prop `palette?: readonly string[]`, pass to `ColorPickerField`.
4. `NodeFormattingPopover`: read mode via `useTheme().palette.mode`. Pass `COLOR_PICKER_SOFT_DARK_PALETTE` when `dark`, else `COLOR_PICKER_SOFT_LIGHT_PALETTE`, to `Fill color` button only. `Font color` and `Border color` unchanged.
5. No change to data model, persistence, `diagramRoleStyle`, or other pickers.

Justification for prop (AGENTS.md "mode parameters" rule): verified call sites need different swatches — `Fill color` soft, all others hard.

Edge cases:

* Stored value is plain hex. Picking soft light swatch, then switching to dark theme, keeps light pastel fill. Known limitation; no per-theme storage.
* Existing diagrams with hard fill colors render unchanged. Their value matches no soft swatch, so no swatch marked selected; custom color input still shows value.
* `Default` box unchanged: reports `undefined`, role default style applies.
* Custom color input still allows any hex.

## Acceptance criteria

* In light theme, `Fill color` picker in legend node formatting shows `COLOR_PICKER_SOFT_LIGHT_PALETTE` swatches; in dark theme shows `COLOR_PICKER_SOFT_DARK_PALETTE` swatches.
* Picking soft swatch and Apply stores that hex as `box.fillColor`; legend sample and canvas nodes of that role show it.
* `Font color` and `Border color` in same popover still show `COLOR_PICKER_PALETTE`.
* Connection formatting, markdown section, column, card type, theme settings pickers still show `COLOR_PICKER_PALETTE`.
* `Default` box and custom color input behave as before.
* Existing fill colors load and render unchanged.

Tests:

* `color_picker_field.test.tsx`: given `palette` prop, renders exactly those swatches and reports picked value; without prop, renders `COLOR_PICKER_PALETTE`.
* `color_picker_button.test.tsx`: `palette` prop reaches opened picker.
* `diagram_formatting_popover.test.tsx`: `Fill color` shows soft dark swatches under dark theme, soft light swatches under light theme; `Font color` shows hard swatches.
* Existing tests stay green (they set `fillColor` via props, not via hard swatches).
