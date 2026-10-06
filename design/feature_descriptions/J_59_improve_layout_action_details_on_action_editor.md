---
author: 
id: J_59
internalId: 977e97f1-1590-48d6-ae9e-6a74808b24d2
title: improve layout action details on action editor
status: ready
owner: 
affects:
agents:
  - design/activity/card__977e97f1-1590-48d6-ae9e-6a74808b24d2.json
policy:
changedFiles:
  - app/src/components/actions/editor/action_definition_fields.grouped.test.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
---

When in list view, we have the action editor. The first group is labeled 'action details'.

We need to improve the layout of the components:

* first row: label, description
* second row: type, output kind, icon
* last row: ask-user-for, version question

## Current state

- `ActionEditorContent` is sole caller of `ActionDefinitionFields` (`app/src/components/actions/editor/action_definition_fields.tsx`). Its first `ActionDefinitionGroup`, titled "Action details", currently renders:
  - one row (`Stack`, row on `md`+, column below `md`): Label, Type, Output kind, Icon;
  - Description, full width;
  - Ask user for, full width;
  - Version question (optional), full width, only when Ask user for is `version`.
- Group children are stacked by `ActionDefinitionGroup` with `spacing={2}`. Fields container has `maxWidth: 720`. "Run settings" group already uses CSS grid with `gridTemplateColumns: { md: 'repeat(3, 1fr)', xs: '1fr' }`.
- Test `shows label, type, and icon before description ...` in `action_definition_fields.grouped.test.tsx` asserts DOM order Label, Type, Icon, Description. This order changes with new layout.

## Implementation details

- Only `action_definition_fields.tsx` changes; only "Action details" group markup. No handler, draft, validation, service, or data changes.
- Replace current row + stacked fields with three rows:
  1. Label, Description. CSS grid `gridTemplateColumns: { md: '1fr 2fr', xs: '1fr' }`, `columnGap: 1`: Label 1/3 width, Description 2/3. Label then lines up with Type in row 2.
  2. Type, Output kind, Icon. `Stack direction={{ md: 'row', xs: 'column' }} spacing={1}`, same as current row; fields `fullWidth`, so each gets 1/3 width.
  3. Ask user for, Version question (optional).
- Row 3: Version question stays conditional (only when Ask user for is `version`). To keep Ask user for from jumping between full and half width, row 3 uses fixed two equal columns (CSS grid `gridTemplateColumns: { md: 'repeat(2, 1fr)', xs: '1fr' }`, `columnGap: 1`); Ask user for keeps first column when question hidden.
- Below `md` breakpoint all fields stack in one column in order Label, Description, Type, Output kind, Icon, Ask user for, Version question.
- Field props (labels, `fieldId`, `name`, error/helper text, `size="small"`) unchanged. Helper/error text under one field may make row heights differ; align row items at top (`alignItems: 'start'` / `flex-start`) so inputs stay aligned.
- Tests: update stale order test to assert new DOM order Label, Description, Type, Output kind, Icon, Ask user for (behavior intentionally changed by this card). Existing grouping test (`groups agent controls under four ordered definition headings`) keeps passing unchanged. Run `npm run test -- src/components/actions/editor/action_definition_fields.grouped.test.tsx`, app typecheck, and app lint.

## Acceptance criteria

- In list view action editor, "Action details" group shows on `md`+ width: row 1 Label (1/3 width) and Description (2/3 width); row 2 Type, Output kind, Icon; row 3 Ask user for and, when Ask user for is Version, Version question (optional).
- Ask user for keeps same width whether Version question is shown or hidden.
- Below `md` width all fields stack vertically in same order.
- Validation errors still show under correct field; inputs in same row stay top-aligned.
- Editing any field still stages and commits draft exactly as before; other groups (Run settings, Availability, Action sequence) unchanged.
- Updated order test, existing `ActionDefinitionFields` tests, app typecheck, and app lint pass.