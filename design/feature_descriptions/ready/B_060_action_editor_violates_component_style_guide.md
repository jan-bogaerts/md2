---
id: B-060
title: action editor controls violate the component style guide
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

New action-editor components do not follow `design/STYLE_GUIDE.md`:

- fields use floating/outlined `TextField` labels instead of labels above controls;
- move/remove icon buttons have `aria-label` but no `Tooltip`;
- new components import `mdi-material-ui` icons instead of outlined `@mui/icons-material` icons;
- row-level move/remove actions remain visible at rest;
- add controls use default text buttons where an action button is expected;
- multi-control rows can overflow narrow text-view layouts.

Affected files:

- `action_definition_fields.tsx`
- `action_agent_capability_fields.tsx`
- `action_filter_editor.tsx`
- `action_link_list_editor.tsx`
- `action_on_rules_editor.tsx`

## Fix

- Add plain `Typography` labels above controls and associate them through `id`/`aria-labelledby`.
- Use theme tokens and existing flat-input patterns from related text/config editors.
- Wrap every icon-only control in a tooltip while retaining a specific accessible name.
- Use outlined MUI icons.
- Keep row actions mounted but hide them with opacity until hover/focus-within; disabled reorder controls remain discoverable on keyboard focus.
- Use explicit outlined/contained button variants according to action priority.
- Add responsive wrapping/stacking so filter and link rows fit mobile/narrow panels without horizontal overflow.
- Limit changes to action-editor components; do not broadly restyle existing action popup code in this card.

## Edge cases

- Keyboard-only users must reveal and operate row controls.
- Tooltip must not be the only accessible name.
- Error/helper text remains associated with the control.
- Long action labels, paths, regex values, and translated labels.
- Dark mode, high contrast, and mobile width.

## acceptance criteria

- Action editor follows field-label, icon, tooltip, button, row-action, theme, and responsive rules in `STYLE_GUIDE.md`.
- No hardcoded color is introduced.
- Every interactive control has visible hover/focus behavior and accessible naming.
- No horizontal overflow at supported mobile width.
- Component tests cover labels, tooltips, keyboard focus, error association, and responsive structure; visual review covers light/dark modes.

## see also

- `design\STYLE_GUIDE.md`
- `design\architecture\initial description\writings\action_editor.md`
