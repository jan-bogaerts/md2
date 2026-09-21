---
author: 
id: F_372
internalId: c06d609b-025a-4540-a69a-ad451e272b15
title: Improve legend config editor
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__c06d609b-025a-4540-a69a-ad451e272b15.json
policy:
---
Through the items on the legend on the diagrams  it is possible to configure the style of the items. When hovered over item, it show a gear, this opens a popup with config fields like font, size, color, fill, border. There is however little info on the popup (labels, helper text). And rhe inputs are not ok.

We already created a custom color picker, lets reuse this for colors. Use sliders for numbers,...

## Current state

Each legend row shows a settings button on hover or keyboard focus. Node rows open `NodeFormattingPopover`; connection rows open `ConnectionFormattingPopover`. Both editors keep a local draft, apply one category-level formatting update through `DiagramViewService` or `DiagramEditSessionService`, and discard the draft on Cancel. This supports both Current and New diagram tabs.

Node formatting covers font family, font size, font color, bold, italic, underline, fill color, border color, border style, border thickness, corner radius, and content position. Connection formatting covers label font settings, line color and thickness, plus start and end markers.

Fields expose accessible names but almost no visible labels or guidance. Colors use plain text fields that require `#RRGGBB`. Numeric values use number fields even though their valid ranges are known: font size 1-200, border and line thickness 0-20, and corner radius 0-100. Empty optional values mean "use theme or connection-kind default"; parser validation and persistence already preserve this distinction.

`ColorPickerField` already provides a native color input and preset swatches. Its current callers require a color, while diagram formatting colors are optional and therefore also need a clear "Use default" state.

## Implementation details

* Keep settings-button discovery, popover anchoring, local-draft behavior, Apply/Cancel timing, service ownership, and category-level persistence unchanged.
* Give every control a visible label. Add short helper text where meaning, unit, default behavior, or range is not obvious. Display friendly option text such as "Top left" and "Filled arrow", while storing existing enum values unchanged.
* Reuse `ColorPickerField` for font, fill, border, and line colors. Extend or compose it with an explicit "Use default" action for optional diagram colors. Existing card-type, column, and theme-settings callers keep required-color behavior.
* Replace font size, border thickness, corner radius, and line thickness number fields with keyboard-accessible MUI sliders. Show current numeric value and unit beside each slider. Use parser bounds: 1-200 px for font size, 0-20 px for both thickness values, and 0-100 px for corner radius.
* Preserve optional numeric semantics. Each slider has an explicit default/custom state: default omits the field and uses rendered theme or connection-kind behavior; custom stores slider value. Loading an existing value selects custom and shows that exact value. Returning to default removes only that override.
* Keep font family as text input, font emphasis as checkboxes, and border style, content position, and endpoint markers as selects. Group node controls under Font and Box; group connection controls under Label font and Connection.
* Keep footer pinned while form body scrolls. Put Cancel and Apply at bottom right. Apply validates through existing service/parser path; validation or persistence failure uses `dialogService`, leaves popover open, and keeps draft available for correction.
* Extract repeated labeled color and numeric controls into focused components rather than duplicating node and connection behavior. Keep each component in its own file. Do not move draft or domain state out of existing service paths.
* Update legend formatting tests to cover visible labels and helper text, preset color selection, default/custom reset, slider bounds and keyboard operation, loading saved overrides, friendly select labels with unchanged stored enums, Apply, Cancel, and error retention. Cover both node and connection editors; retain Current/New store isolation.

## Acceptance criteria

* Opening node or connection formatting shows a visible label for every input and concise guidance for default behavior, units, and bounded values.
* Font, fill, border, and line colors use the shared color picker with native selection and preset swatches; users do not need to type a hex value.
* Each optional color can be returned to "Use default". Applying that state omits only that color override and restores existing theme or connection-kind rendering.
* Font size uses a 1-200 px slider. Border thickness and line thickness use 0-20 px sliders. Corner radius uses a 0-100 px slider. Each slider works with pointer and keyboard and exposes its label, minimum, maximum, and current value to assistive technology.
* Existing numeric overrides open at their stored values. Choosing default removes the override; it does not store an arbitrary replacement value.
* Font family and emphasis controls remain available. Border style, content position, start marker, and end marker show readable option labels and still persist existing enum values.
* Apply performs one update for the edited node role or connection kind, then closes. Cancel, Escape, or backdrop close performs no update.
* If Apply fails, existing error reporting appears, popover remains open, and entered draft values remain intact.
* Current formatting continues through `DiagramViewService`; New formatting continues through `DiagramEditSessionService`. Changes stay isolated to selected tab/store and update diagram plus legend samples through existing scoped subscriptions.
* Existing required-color uses of `ColorPickerField` keep their behavior.
* Relevant legend formatting and shared color-picker tests pass with added coverage above.
