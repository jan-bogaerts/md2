---
author: 
id: F_144
internalId: 385eccb9-06c4-4d93-8f8a-5f9b9f42e45f
title: appbar and toolbar scrolling
status: ready
owner: 
affects:
agents:
  - design/activity/card__385eccb9-06c4-4d93-8f8a-5f9b9f42e45f.json
policy:
after: 6a25a6de-234c-4d7a-9d59-7ce9e86992b5
branch: f_144_appbar_and_toolbar_scrolling
changedFiles:
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/horizontal_scroll_area.test.tsx
  - app/src/components/horizontal_scroll_area.tsx
  - app/src/components/shell/menu/tab.grouped.test.tsx
  - app/src/components/shell/menu/tab.tsx
  - app/src/test/real_editor_setup.ts
  - app/src/test/setup.ts
---
When on the desktop (on mobile, it is ok):

currently, when the markdown editor toolbar doesn't fit in the window (horizontally), it shows a standard horizontal scrollbar and also a vertical scrollbar cause the hor scrollbar takes up too much space.

This is not ok, we need to add custom scroll behavior for this and also the appbar.

options I can think of:

* use different scroll solution:
  * when hor scrolling is needed, use 2 buttons: one at the left side, one at the right, visible when scrolling in that direction is possible. when clicked, scroll toolbar.
  * scrolling with the mouse wheel should also scroll horizontally
  * don't show standard scrollbars
* resize the container that contains the appbar / markdown toolbar so that we don't need a vertical scrolbar
* and optionally also use a smaller scrollbar like on mobile

what option do you think is best?

## Decision

Option 1: custom horizontal scroll with overlay buttons, applied everywhere (desktop and mobile).

## Cause

* Appbar: `shell/menu/tab.tsx` has a fixed `height: 52` with `overflowX: 'auto'`. On Windows the scrollbar takes space inside those 52px, so the content also overflows vertically.
* Markdown toolbar: MDXEditor's `.mdxeditor-toolbar` uses `overflow-x: auto` by default.

## Behavior

* New generic layout component `HorizontalScrollArea` (in `app/src/components/`), with `children` as its content.
* Native scrollbars are hidden (`scrollbarWidth: 'none'`, `::-webkit-scrollbar { display: none }`).
* A left and a right button float over the content, with a fade. Each is visible only when you can scroll further in its direction. Clicking scrolls by a named step constant, with smooth scrolling.
* Mouse wheel: vertical wheel movement scrolls horizontally, but only when the content overflows. Trackpad sideways scrolling is left alone. This needs a native `wheel` listener registered with `{ passive: false }`.
* Keyboard: when a control inside receives focus (`focusin`), it scrolls into view (`inline: 'nearest'`). The container's `scroll-padding-inline` equals the button width, so a focused control never stops under a floating button.
* Button visibility is recalculated on `scroll` and on `ResizeObserver` changes, for both the container and the content, because controls appear and disappear with the selection.

## Affected components

* `shell/menu/tab.tsx`: wraps its row in `HorizontalScrollArea`. This covers the Home and Run tabs in `app_menu.tsx`, `diagram_menu_tab.tsx` and `stats_menu_tab.tsx`.
* `editor/markdown_editor.tsx`: `toolbarContents` renders inside `HorizontalScrollArea`, and `.mdxeditor-toolbar` gets `overflow: hidden`. All MDXEditor toolbars go through this (card editor, card body editor, new card editor, action editor phrase/list toolbars).
* `shell/menu/main_toolbar.tsx`: its MUI `Tabs` already scrolls with `scrollButtons={false}`. It is out of scope unless it overflows in practice.

## Edge cases

* Popovers and dropdowns opened from the toolbars (emoji, placeholder, search, branch select, new-diagram menu) must not be cut off by `overflow: hidden`. Check that each one renders in a portal.
* `markdown_local_text_search_plugin.tsx` looks up `.mdxeditor-toolbar`. Check that its positioning still works.
* When content fits, no buttons and no wheel capture.

## Tests

* `HorizontalScrollArea`: which buttons are visible at the start, middle and end; clicking scrolls; the wheel is converted only when content overflows; focus scrolls the control into view. jsdom has no layout, so tests must stub `scrollWidth`, `clientWidth` and `scrollLeft`.
* Update `tab.grouped.test.tsx` and the toolbar tests that query `.mdxeditor-toolbar` if their DOM assumptions change.