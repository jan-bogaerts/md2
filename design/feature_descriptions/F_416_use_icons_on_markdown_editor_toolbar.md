---
author: 
id: F_416
internalId: 04b4a3a2-45cc-425c-bc43-6c46a294447c
title: use icons on markdown editor toolbar
status: ready
owner: 
affects:
agents:
  - design/activity/card__04b4a3a2-45cc-425c-bc43-6c46a294447c.json
policy:
---

we currently have 2 text buttons (rich-text and source) on the markdown editor toolbar. we should replace them with icon buttons, no text, but with tooltip
## Current state

* `MarkdownSourceModeControls` (`app/src/components/editor/source/markdown_source_mode_controls.tsx`) renders MUI `ToggleButtonGroup` (`aria-label="Markdown view"`, exclusive, small) with two text `ToggleButton`s: `rich-text` → "Rich text", `source` → "Source". No icons, no tooltips.
* Rendered in two places, both get the change automatically:
  * editor toolbar: `MarkdownEditor` (`app/src/components/editor/markdown_editor.tsx`), first item in toolbar when not plain text, toolbar not hidden, view mode not `diff`.
  * compact recovery bar: `MarkdownSourceRecovery` (`app/src/components/editor/source/markdown_source_recovery.tsx`), shown in compact editors on conversion error or source mode.
* Sibling toolbar icon controls (`markdown_list_indent_toolbar_controls.tsx`, `markdown_emoji_toolbar_control.tsx`) use pattern: `Tooltip` title + matching `aria-label` + Outlined icon with `fontSize="small"`. Existing `ToggleButton` + `Tooltip` pattern: `markdown_local_text_search_plugin.tsx` ("Match case").
* `STYLE_GUIDE.md`: icon-only control needs `Tooltip` and `aria-label`; icons from `@mui/icons-material` Outlined variants.
* MUI 9: `ToggleButton` reads group state through React context, so wrapping a `ToggleButton` in `Tooltip` keeps selection and `onChange` working.
* `markdown_editor_reliability.real.test.tsx` finds the buttons by accessible name (`getByRole('button', { name: 'Source' | 'Rich text' })`) and checks `aria-pressed`.

## Implementation details

1. In `markdown_source_mode_controls.tsx`, replace button text with icons:
   * `rich-text`: `ArticleOutlined` icon, `aria-label="Rich text"`, wrapped in `Tooltip title="Rich text"`.
   * `source`: `CodeOutlined` icon, `aria-label="Source"`, wrapped in `Tooltip title="Source"`.
   * Icons `fontSize="small"`, same as sibling toolbar icon buttons.
2. Keep `ToggleButtonGroup`, its `aria-label`, `exclusive`, `size="small"`, `value`, and `handleModeChange` unchanged. Mode switch behavior unchanged.
3. Accessible names stay "Rich text" / "Source" (via `aria-label`), so existing reliability tests keep working without edits.
4. No changes to `markdown_editor.tsx`, `markdown_source_recovery.tsx`, or controller.

### Edge cases

* Tooltip on selected or disabled button: buttons are never disabled here; no `span` wrapper needed.
* Compact recovery bar: same component, shows icons + tooltips too.
* `diff` view and plain-text editors: control not rendered, unchanged.

### Tests

* Add `markdown_source_mode_controls.test.tsx` (next to component): renders with `@mdxeditor/editor` stub; assert buttons named "Rich text" and "Source" have no visible text, show tooltip text on hover, and clicking "Source" calls controller `setMode('source')`.
* Existing `markdown_editor_reliability.real.test.tsx` must pass unchanged.

## Acceptance criteria

* Markdown editor toolbar shows two icon-only toggle buttons for rich text and source; no button text.
* Hover or keyboard focus on each button shows tooltip "Rich text" / "Source".
* Screen readers announce buttons as "Rich text" / "Source"; selected button has `aria-pressed="true"`.
* Clicking a button switches view mode as before; active mode stays visibly selected.
* Compact recovery bar shows same icon buttons.
* Diff view and plain-text editors unchanged.
