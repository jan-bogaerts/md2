---
author: 
id: B_271
internalId: 55646f70-22ca-4ed7-a4b6-d2e0276d1923
title: placeholder popup on card popup
status: ready
owner: 
affects:
agents:
  - design/activity/card__55646f70-22ca-4ed7-a4b6-d2e0276d1923.json
policy:
changedFiles:
  - app/src/components/editor/placeholders/markdown_placeholder_typeahead_plugin.real.test.tsx
after: dc18bd32-58a2-4426-99ce-c79309619b03
---
check [F\_420\_missing\_placeholder\_popup.md](design/releases/0.8.3/F_420_missing_placeholder_popup.md). we added the placeholder popup again to the card popup, but implementation is not correct. see how the positioning is done when used on the [action\_popup.tsx](app/src/components/actions/run/popup/action_popup.tsx).&#x20;

maybe relative vs absolute pos coordinates?

## Current state

`MarkdownPlaceholderTypeaheadPlugin` passes the editor's `overlayContainer` as `parent` to Lexical's `LexicalTypeaheadMenuPlugin`, then portals `MarkdownPlaceholderMenu` into Lexical's anchor `div`. Lexical (`useMenuAnchorRef`) appends that anchor `div` to `parent` with `position: absolute` and sets `top`/`left` from the caret's viewport rectangle plus `window.pageXOffset`/`pageYOffset`. Those are page coordinates, so they are only correct when the anchor's containing block (nearest positioned or transformed ancestor) is the page.

* Action popup prompt (`ActionAgentPrompt`): passes no `overlayContainer`, so Lexical appends the anchor to `document.body`. Page coordinates match, and the menu appears at the caret.
* Card popup (`CardBodyPopover` passes `popupContentElement` to `CardBodyEditor`): the anchor lands inside the `ResizablePopper` paper, which is positioned and transformed by Popper. Page coordinates are applied relative to the paper, so the menu is shifted right and down by the popup's own screen offset. It can land far from the caret or outside the visible popup.
* New card dialog (`NewCardDialog` passes the description `Box` to `NewCardMarkdownEditor`): same mechanism. The anchor's containing block is the MUI dialog paper, so the same offset error is expected there.

`MarkdownFileSearchTypeaheadPlugin` (`@` file search) avoids the problem: it captures the caret rectangle in `onOpen` and renders its menu in its own `ResizablePopper` anchored to a `position: fixed` element portaled to `document.body`. Lexical's misplaced anchor only gates rendering.

The existing card-popup and new-card regression tests assert that the listbox is inside `overlayContainer`. jsdom has no layout, so they cannot detect the offset.

## Implementation details

* Change `MarkdownPlaceholderTypeaheadPlugin` / `MarkdownPlaceholderMenu` so the visible menu no longer depends on where Lexical's anchor `div` lives:
  * Capture the caret rectangle from `MenuResolution.getRect()` when the menu opens (`onOpen`), and clear it on `onClose` and on `RESET_MARKDOWN_DRAFT_COMMAND`.
  * Render `MarkdownPlaceholderMenu` inside an MUI `Popper` anchored to a virtual element whose `getBoundingClientRect` returns that rectangle (placement `bottom-start`, flip allowed). The `Popper` portals to `document.body`, which resolves viewport coordinates correctly regardless of the editor's container.
  * Move the `zIndex` (`theme.zIndex.modal + stackPosition + 1` from `useMarkdownTypeaheadStackPosition`) from the `Paper` to the `Popper`, so the menu stays above the owning popup.
  * Keep the `menuRenderFn` gate on `anchorElementRef.current` and on a non-empty option list. Keep the `parent={overlayContainer}` pass-through; the Lexical anchor becomes an invisible render gate only.
* Keep trigger, filtering, keyboard navigation, and selection unchanged. `MarkdownPlaceholderOptionItem` already prevents `mousedown` default, so editor focus is kept when the menu lives outside the card popup or the dialog's focus trap.
* Call sites of the shared plugin, all of which receive the new behavior:
  * `ActionAgentPrompt` (no `overlayContainer`): already correct; must stay correct.
  * `CardBodyEditor` in the card popup: the fix target.
  * `NewCardMarkdownEditor` in the new card dialog: same bug, fixed by the same change.
* No change to `overlayContainer` handling for the emoji picker, toolbar placeholder control, file search, or local text search.
* Tests:
  * Update `card_body_editor.real.test.tsx` and `new_card_markdown_editor.real.test.tsx`: drop the assertion that the listbox is inside `overlayContainer` (stale: containment was the cause of the offset). Keep the open, filter, and select assertions.
  * Add a plugin-level test with a stubbed `Range.getBoundingClientRect` that asserts the menu's `Popper` uses the caret rectangle when the editor sits inside an offset, positioned container.
  * Run `action_agent_prompt.test.tsx` and the placeholder plugin and menu tests.

## Acceptance criteria

* In the card popup, typing `{{` in the body editor opens the insert-placeholder popup directly below the caret (or above when there is no room below), at any popup position, size, and fullscreen state.
* The popup is fully visible, above the card popup, and also above stacked card or action popups that own the editor.
* Typing a name filters options. Clicking or pressing Enter on an option replaces the `{{` query with `{{name}}` and keeps focus in the editor.
* The new card dialog shows the popup at the caret too, and the action popup prompt keeps its current behavior.
* `@` file search, emoji picker, and toolbar placeholder control behave as before.