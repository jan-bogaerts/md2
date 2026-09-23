---
author: 
id: F_376
internalId: f74940ea-692a-487e-a021-7e2f5f10d236
title: Markdown config editor improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__f74940ea-692a-487e-a021-7e2f5f10d236.json
policy:
after: d35077d6-dd5e-4bba-a00b-ad28b7e7df70
---
On the config dialog, makdown tab, we allow configuration of markdown style. This is currently split in preview and edit. This makes no sense. When user clicks on item in preview,  show popup with config. Drop edit section below.

## Current state

* `MarkdownConfigSection` (`app/src/components/config/markdown_config_section.tsx`) renders, top to bottom: the `Style` select, `MarkdownStylePreview`, then one `MarkdownSectionEditor` accordion per entry in `MARKDOWN_SECTIONS` (11 sections: `title1`, `title2`, `title3`, `body`, `caption`, `link`, `list`, `blockquote`, `inlineCode`, `codeBlock`, `table`). It also owns `MARKDOWN_SECTION_LABELS` and `handleSectionChange`, which writes the edited section into the config and switches the style name to `custom`.
* `MarkdownStylePreview` (`markdown_style_preview.tsx`) is read-only. It renders static sample markup (`h1`, `h2`, `h3`, `p` with an `a` and inline `code`, `ul`/`li`, `blockquote`, `pre code`, `table`, `small`) styled by `buildMarkdownContentSx(config)`. The sample link has `href="#markdown-preview"`; clicking it replaces the `#/config/markdown` route hash, which `app_navigation.ts` listens to.
* `MarkdownSectionEditor` (`markdown_section_editor.tsx`) is an `Accordion` with local `expanded` state. Its fields (font family, font size, line height, color, space before, space after, bold/italic/underline switches) call `onChange(section, style)` on every keystroke, so edits are live: `ConfigPage` holds the draft, the preview repaints, and the config page `Save` / `Cancel` buttons persist or discard.
* Tests: `config_page.test.tsx` opens the Body accordion with `getByRole('button', { name: 'Body' })` in three tests. `markdown_style_preview.test.tsx` renders the preview with only `config`.
* `design/architecture/class_relationships.md` shows `MarkdownConfigSection --> MarkdownSectionEditor`.

## Implementation details

* **Terms.** *Preview element*: one sample element in the preview that represents a markdown section. *Style popover*: an MUI `Popover` anchored to the clicked preview element, holding the section's style fields.
* **Preview owns section selection.** `MarkdownStylePreview` gets a new prop `onSectionChange(section, style)` and keeps transient popover state `{ anchorElement, section } | null` in `useState`. It renders `MarkdownSectionEditor` for the selected section with `style={config[section]}`, so the popover always shows the current draft.
* **Tag preview elements.** Mark each preview element with `data-markdown-section="<section>"`: `h1`→`title1`, `h2`→`title2`, `h3`→`title3`, body `p`→`body`, `a`→`link`, inline `code`→`inlineCode`, `ul`→`list`, `blockquote`→`blockquote`, `pre`→`codeBlock`, `table`→`table`, `small`→`caption`. One click handler constant on the `.mdxeditor-content` box resolves `event.target.closest('[data-markdown-section]')`; the innermost tag wins, so clicking the link inside the body paragraph opens Link, not Body. Clicks outside any tagged element do nothing. Resolve the attribute value against `MARKDOWN_SECTIONS` instead of casting.
* **Keyboard and affordance.** Each tagged element gets `tabIndex={0}` and `aria-label="Edit <label> style"`; Enter or Space opens its popover. Hover and focus show `cursor: pointer` and an outline in the theme primary color, per `design/STYLE_GUIDE.md`. Remove `href` from the sample link so clicking it no longer changes the route hash.
* **Hint text.** Below the `Preview` subtitle add `Click an element to edit its style.` in `text.secondary`.
* **Labels move.** Move `MARKDOWN_SECTION_LABELS` from `markdown_config_section.tsx` into `markdown_style_preview.tsx`, its only remaining user.
* **Editor becomes the popover.** Change `MarkdownSectionEditor` from `Accordion` to `Popover`: props `anchorElement`, `label`, `onChange`, `onClose`, `section`, `style`; drop the `expanded` state. Keep all fields, field names and field labels (for example `Font size for Body`) unchanged. Title `<label> style` (`subtitle2`); body scrolls with `maxHeight: '70vh'`, matching `diagram_formatting_popover.tsx`. No Apply/Cancel buttons: edits stay live, and Escape or click-away closes the popover. The config page `Save` / `Cancel` stay the only commit and discard.
* **Config section.** `MarkdownConfigSection` passes `onSectionChange={handleSectionChange}` to the preview and drops the accordion list and its `Stack`. Style select and helper text stay.
* **Edge cases.**
  * Changing the style select while a popover is open: not possible, the popover is modal and click-away closes it first.
  * Font size or spacing changes move the anchor element; the popover keeps its opening position until reopened. Accepted.
  * Switching preset after edits keeps the existing `window.confirm` flow unchanged.
  * Popover shows invalid text values as typed; `isMarkdownStyleConfig` in `ConfigPage` keeps disabling `Save`, as today.
* **Docs.** Update `design/architecture/class_relationships.md`: replace `MarkdownConfigSection --> MarkdownSectionEditor` with `MarkdownStylePreview --> MarkdownSectionEditor`.
* **Tests.**
  * `config_page.test.tsx`: replace `getByRole('button', { name: 'Body' })` with a click on the preview element labelled `Edit Body style`. In `keeps custom settings when replacing them is not confirmed`, close the popover with Escape before opening the `Style` select, because the modal popover hides the rest of the page from role queries, then reopen Body to assert the kept value.
  * `markdown_style_preview.test.tsx`: pass `onSectionChange` in existing tests; add tests that a click on a preview element opens the popover titled with its label, that clicking the link inside the body paragraph opens Link, that Enter on a focused element opens its popover, that a field change calls `onSectionChange` with the section and updated style, and that Escape closes the popover.

## Acceptance criteria

* The Markdown config tab shows the style select and the preview only; no section accordion list remains below the preview.
* The preview shows the hint `Click an element to edit its style.`.
* Clicking any of the 11 preview elements opens a popover anchored to it, titled with that section's label, holding the same fields as the old accordion.
* Clicking the link or inline code inside the body paragraph opens Link or Inline code, not Body.
* Preview elements are reachable by Tab; Enter or Space opens their popover.
* Editing a field in the popover updates the preview immediately and switches the style select to `Custom`.
* Escape or click-away closes the popover; the draft edits remain; focus returns to the preview element.
* Config page `Save` persists the edited style; `Cancel` discards it, as today.
* Clicking the sample link does not change the route hash.
* Updated and new tests in `config_page.test.tsx` and `markdown_style_preview.test.tsx` pass.
