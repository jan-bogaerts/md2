---
author: 
id: F_252
internalId: 526d5eb3-f1f1-4d3e-a65f-a5721d69a23c
title: add support to insert special chars like emojis
status: ready
owner: 
affects:
agents:
  - design/releases/0_6_0/card__526d5eb3-f1f1-4d3e-a65f-a5721d69a23c.json
policy:
after: 0be5ec62-c3e8-4d20-8b15-fd81f2636fc9
changedFiles:
  - app/src/components/editor/editor_no_mock.test.tsx
  - app/src/components/editor/markdown_editor.grouped.test.tsx
  - app/src/components/editor/markdown_emoji_toolbar_control.grouped.test.tsx
  - app/src/components/editor/markdown_emoji_toolbar_control.tsx
  - app/src/components/editor/markdown_format_toolbar_controls.tsx
  - app/src/data/emojis.node.test.ts
  - app/src/data/emojis.ts
---

these emojis are just part of the char set, so we can create a popup (reachable from the context menu) to select emojis to insert in the markdown editor

## Current state

The shared Markdown editor (`app/src/components/editor/markdown_editor.tsx`) builds its toolbar in `MarkdownFormatToolbarControls` (`markdown_format_toolbar_controls.tsx`). Four surfaces consume that component: card popup toolbar, list editor toolbar, action phrase toolbar, and the editor's own default toolbar. There is no emoji entry point in any of them, so a user who wants an emoji today must use an operating-system picker (Windows `Win + .`) or paste the character from elsewhere.

The feature text asks for a popup "reachable from the context menu". The Markdown editor has no right-click context menu; only card view and the file tree have one. Building one would be a separate, larger change, so this feature uses a toolbar button instead, matching how every other insert control in this editor already works.

`MarkdownPlaceholderToolbarControl` (`markdown_placeholder_toolbar_control.tsx`) is the working reference: an `IconButton` opens a MUI `Menu`, the chosen entry is inserted by dispatching Lexical's `CONTROLLED_TEXT_INSERTION_COMMAND` on `activeEditor$`, focus returns to the editor, and failures go to `dialogService.error`. Its data comes from a static module, `ACTION_PROMPT_PLACEHOLDERS` in `app/src/data/action_placeholders.ts`. The placeholder control is gated behind `placeholders.length > 0`, so it is absent in most editors.

Markdown documents are plain UTF-8 text. An emoji is an ordinary character in that text ("just part of the char set"), so inserting one needs no change to saving, loading, diffing, or rendering.

## implementation details

* Add a static emoji catalogue at `app/src/data/emojis.ts`, following the `action_placeholders.ts` pattern: an `Emoji` interface (`char`, `name`, `keywords`, `group`), a frozen `EMOJIS` array of roughly 1000-1500 common emoji, and an `EMOJI_GROUPS` ordering (smileys, people, nature, food, travel, activities, objects, symbols, flags). Data is committed source, not an npm dependency and not a network fetch, so the picker works offline and adds no runtime dependency.
* Add `app/src/components/editor/markdown_emoji_toolbar_control.tsx`. An `IconButton` (tooltip and `aria-label` `Insert emoji`, mood icon) opens a MUI `Popover` anchored to that button. Use `Popover`, not `Menu`: the content is a scrollable grid of characters plus a filter field, not a vertical list of menu items.
* Pass `overlayContainer` into the `Popover` `container` prop, exactly as `MarkdownPlaceholderToolbarControl` does for its menu. Reason: when the editor is hosted inside the card popover, an overlay rendered into `document.body` stacks and clips wrongly; the container prop keeps it in the popup's own DOM subtree.
* Picker content: a text field labelled `Search emoji` at the top, then group sections in `EMOJI_GROUPS` order. Typing filters by case-insensitive substring match on `name` and on any entry in `keywords`; when a filter is active, group headings for empty groups are not rendered. When nothing matches, show `No emoji found`.
* Insertion follows the placeholder chain: read `activeEditor$` through `useCellValue`, dispatch `CONTROLLED_TEXT_INSERTION_COMMAND` with the literal `char`, call `activeEditor.focus()`, then close the popover. Insert the Unicode character itself, not a shortcode such as `:smile:`, because no Markdown renderer in the app translates shortcodes. If `activeEditor` is missing, throw and report through `dialogService.error` with fallback message `Emoji could not be inserted`, matching the placeholder control.
* Render the control from `MarkdownFormatToolbarControls` inside the existing `!readOnly` block, next to `InsertTable` / `InsertThematicBreak` / `InsertCodeBlock`. Render it unconditionally there, without a new prop. Consequence: all four consuming surfaces get the button with no call-site change, and read-only editors do not show it. The button stays disabled while `activeEditor` is null, like the neighbouring controls.
* Plain-text editors (`plainText` mode) need no special handling: insertion is literal text, so the same control works for non-Markdown fields.
* Out of scope for this feature, to keep it small: a recently-used list, skin-tone variant selection, custom emoji, and a typeahead trigger such as `:smi`. A typeahead can be added later on top of the same catalogue module.
* Tests: add `markdown_emoji_toolbar_control.grouped.test.tsx` modelled on `markdown_placeholder_toolbar_control.grouped.test.tsx`, covering open, filter, insert-dispatch, disabled state, and `overlayContainer` placement. Extend `markdown_editor.grouped.test.tsx` to assert the button is present when editable and absent when read-only. Add a small node test for the catalogue asserting unique `char` values and non-empty `keywords`. Run the focused app tests, `npm run typecheck`, and app lint.

## acceptance criteria

* In an editable Markdown editor, an `Insert emoji` toolbar button is visible. Clicking it opens a picker anchored to the button, containing a search field and grouped emoji.
* Clicking an emoji inserts that literal Unicode character at the caret, closes the picker, and returns focus to the editor so typing continues at the position after the emoji.
* Typing in the search field narrows the grid to emoji whose name or keywords contain the typed text, case-insensitively. When nothing matches, the picker shows `No emoji found` rather than an empty panel.
* The button and picker appear in the card body editor, the list editor, the action phrase editor, and the action popup editor, without any of those call sites passing a new prop.
* In a read-only editor the button is not rendered. While no editor is focused the button is disabled instead of failing on click.
* When the editor is hosted in the card popover, the picker renders inside the popup container and is not clipped by it.
* An inserted emoji survives save and reload of the document unchanged, and no Markdown rendering or serialisation code is modified.
* Focused app tests pass, `npm run typecheck` reports no errors, and app lint reports no errors or warnings.
