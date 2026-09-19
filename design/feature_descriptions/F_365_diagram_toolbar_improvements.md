---
author: 
id: F_365
internalId: 7e54add8-465d-47ff-90fd-7f9cc49c79f1
title: diagram toolbar improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__7e54add8-465d-47ff-90fd-7f9cc49c79f1.json
policy:
branch: f_365_diagram_toolbar_improvements
worktree: 2
---
On the diagram tab of the app menu, we show: current font size, current box size, current spacing with an up and down button and a value in between. we should change this: instead of `current font size`, use an icon, instead of a up and down button, the icon button should open a popup with a slider that increases or decreases the value. This should be done for all 3. include a tooltip that explains the function on the icon button.

## Current state

`DiagramMenuTab` renders `DiagramFormattingControls` in its Formatting section. Outside edit mode it renders three `Current` controls. During an edit session it renders those controls plus three independent `New` controls. Each set covers font size, box size, and spacing, so edit mode shows six controls.

`DiagramFormattingScaleControl` currently renders each value as a text label, decrease button, percentage, and increase button. Changes use 10-percentage-point steps within the shared 50% to 200% bounds; a missing formatting value reads as 100%.

Each control subscribes only to its field through `useDiagramFormattingScale`. `Current` changes call `DiagramViewService.setFormattingScale`, which updates the active diagram, relayouts box-size or spacing changes, and schedules the diagram file for persistence. `New` changes call `DiagramEditSessionService.setFormattingScale`, which updates only the editable diagram and records or clears its scoped formatting change against the edit baseline.

## implementation details

* Replace each `DiagramFormattingScaleControl` stepper with one outlined MUI icon button: `FormatSizeOutlined` for font size, `AspectRatioOutlined` for box size, and `FormatLineSpacingOutlined` for spacing. Remove visible `Current`/`New` labels, percentage text, and decrease/increase buttons from the toolbar itself.
* Keep `DiagramFormattingControls` as the shared owner of the three field definitions and use the same control for both surfaces. Do not duplicate Current and New implementations.
* Give every icon button a tooltip and matching accessible name in the form `Adjust Current font size` or `Adjust New spacing`. Surface name remains necessary because all six controls can appear together.
* Clicking an icon button opens a MUI `Popover` anchored to that button. Popover shows the surface and field name, current percentage, and one horizontal MUI `Slider`. Transient anchor element may stay inside the control; formatting value remains owned by the supplied service.
* Configure slider from existing constants: minimum `DIAGRAM_FORMATTING_SCALE_MINIMUM` (50), maximum `DIAGRAM_FORMATTING_SCALE_MAXIMUM` (200), and step `DIAGRAM_FORMATTING_SCALE_STEP` (10). Show percentage as slider value text and an always-visible value beside the slider.
* Apply each pointer or keyboard slider change immediately through existing `store.setFormattingScale(field, value)`. Keep current service behavior: Current changes update and persist active diagram; New changes update editable draft and its review change. No service, diagram schema, validation, layout, or persistence changes are required.
* Close popover through Escape or outside click. Closing keeps selected value. Reopening reads latest service snapshot, including changes made elsewhere while popover was closed.
* Update `diagram_menu_tab.test.tsx` and add focused `DiagramFormattingScaleControl` coverage. Test six distinct buttons in edit mode, tooltips and accessible names, correct popover/slider identity, 50%/200% bounds, 10-point keyboard and pointer changes, Current/New isolation, live percentage display, and close/reopen behavior. Remove assertions for deleted decrease/increase controls.

## acceptance criteria

* Outside edit mode, Formatting section shows three icon buttons for Current font size, box size, and spacing. During edit mode it also shows three corresponding New icon buttons, for six controls total.
* Toolbar shows no formatting text labels, percentage values, or decrease/increase buttons.
* Each icon communicates its field visually and exposes a tooltip plus accessible name that identifies both surface and function.
* Clicking any formatting icon opens its anchored popover with correct field name, current percentage, and one slider.
* Every slider uses 50% minimum, 200% maximum, and 10-percentage-point steps. Pointer and keyboard interaction cannot move value outside those bounds.
* Slider changes update diagram live. Font size changes update rendered text; box-size and spacing changes trigger existing layout behavior.
* Current slider changes update and schedule persistence for active diagram. New slider changes affect only editable diagram and remain represented as scoped review changes until accepted or reverted.
* Closing popover does not undo selected value. Reopening shows latest value from corresponding service.
* Existing diagram formatting validation, serialization, layout, dirty-state, and persistence tests remain passing, together with updated toolbar control tests.
