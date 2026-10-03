---
author: 
id: B_257
internalId: 5cbb6339-2a3c-4462-94cf-a575f916ad39
title: Action output kind
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__5cbb6339-2a3c-4462-94cf-a575f916ad39.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
---
When editing an action in the action editor  we have the field ´output kind´ with 2 options.

If you select ´regular´ , the select remains empty, it should say ´regular´

## Current state

* `app/src/components/actions/editor/action_editor_field.tsx` (`ActionEditorField`) wraps an MUI `TextField`. For selects it passes the select slot props `{ inputProps, labelId }`. It never sets `displayEmpty`.
* Cause: an MUI `Select` renders the label of the selected option only when the value is non-empty or `displayEmpty` is `true`. An option with value `''` therefore shows a blank box, both on load and after the user picks it. `ActionEditorField` puts its label outside the box, so nothing is shown at all.
* Affected `ActionEditorField` selects (all have a `<MenuItem value="">` option):
  * `action_definition_fields.tsx`: Output kind (`Regular`), Icon (`No icon`), Ask user for (`None`), Run when card enters state (`No state trigger`).
  * `app/src/components/actions/agent/action_agent_capability_fields.tsx`: Agent (`Application default`), Model (`Select model`), Permission mode (`Application default`).
* Output kind detail: `handleOutputChange` stores `output: undefined` for Regular and `{ kind: 'diagram' }` for Diagram. Stored data is correct; only the display is wrong. The same holds for the other fields.
* Unaffected `ActionEditorField` selects: Type, Thinking level (`none` is a real value), `action_selector_field.tsx` (Action), and the two selects in `action_filter_editor.tsx`. None has a `''` option.
* `app/src/components/actions/conversation/picker/action_conversation_picker.tsx` already sets `displayEmpty: true`. Not affected.
* Out of scope: diagram selects using a plain `TextField` with a floating `label` (`diagram_font_family_select.tsx`, `diagram_node_details_editor.tsx` Key, `diagram_edge_details_editor.tsx` From/To cardinality). With `''` they show the floating label inside the box, not a blank box. Fixing them also needs `shrink` on the label; separate change.

## Implementation details

* `action_editor_field.tsx`: set `displayEmpty: true` in the select slot props: `{ select: { displayEmpty: true, inputProps: { 'aria-describedby': describedBy }, labelId } }`. No new prop.
  * Call-site impact: `displayEmpty` only changes rendering when the value is `''`. The seven affected fields above get the fix. Unaffected selects have no `''` option, so with `''` they still render blank, as today. Text inputs do not use the select slot.
* No change to call sites, stored action definitions, change handlers, or the auto-finish logic.

## Acceptance criteria

* When the action editor opens an action with no `output`, Output kind shows `Regular`.
* When the user changes Output kind from Diagram to Regular, the field shows `Regular` and the definition has no `output`.
* When the action has `output: { kind: 'diagram' }`, Output kind still shows `Diagram`.
* With the empty value, Icon shows `No icon`, Ask user for shows `None`, Run when card enters state shows `No state trigger`, Agent shows `Application default`, Model shows `Select model`, Permission mode shows `Application default`.
* Selects with a non-empty value show their selected option as before.
* Tests:
  * `action_editor_field.grouped.test.tsx`: regression test: render a select `ActionEditorField` with value `''` and a `<MenuItem value="">None</MenuItem>` option; expect `getByLabelText(label)` to have text content `None`. Fails before the fix.
  * `action_definition_fields.grouped.test.tsx`: render a definition without `output`; expect `getByLabelText('Output kind')` to have text content `Regular`.
  * `action_definition_fields.grouped.test.tsx`: switch Output kind from Diagram to Regular through the menu; expect the field to show `Regular`.
