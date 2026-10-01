---
author: 
id: F_188
internalId: c00ec008-cf20-4fd2-81e2-254b2b400c48
title: add support ctrl tab in list view
status: ready
owner: 
affects:
agents:
  - design/activity/card__c00ec008-cf20-4fd2-81e2-254b2b400c48.json
policy:
after: de670664-aeae-4814-bf3f-4bb280bd85a9
branch: f_188_add_support_ctrl_tab_in_list_view
worktree: 2
changedFiles:
  - app/src/services/shortcuts/list_tab_shortcuts.ts
---
to switch between tabs. So when in list view, app should always respond to ctrl+tab and switch to the next tab in the list

## Current state

* **List view** is workspace view mode `'text'` (`WorkspaceViewMode` in `app/src/services/project/workspace_view_service.ts`). `TextView` (`app/src/components/text_view/text_view.tsx`) mounts once in `project_workspace.tsx` for the workspace lifetime and only toggles its own `display` when the view mode changes.
* **Tabs** are rendered by `TabBar` (`app/src/components/text_view/tab_bar.tsx`) from `openFilesService.getSnapshot()`: one tab per entry of `documents`, in that order; the selected tab is `activeDocument`. Clicking a tab calls `openFilesService.activateDocument(document)` and `telemetryService.trackEvent('navigation')`. Every open document gets a tab: an action without `sourcePath` cannot be opened, because `draftForObject` throws for it.
* `OpenFilesService` (`app/src/services/open_files_service.ts`) has no method to move to a neighbouring tab.
* No key switches tabs. Global shortcuts go through `KeyboardShortcutService` (`app/src/services/shortcuts/keyboard_shortcut_service.ts`): one bubble-phase `keydown` listener on `window`. On a match it calls `preventDefault()` and then the binding's `run`. Current bindings: `global-search` (`GLOBAL_SEARCH_SHORTCUT_BINDING`, registered in `main_window.tsx`) and `commit` (registered in `app_menu.tsx`).
* `KeyboardShortcut` (`app/src/services/shortcuts/keyboard_platform.ts`) has only a `mod` modifier. `mod` means Ctrl on Windows/Linux and Cmd on Apple. A literal Ctrl binding is therefore impossible on macOS, where Cmd+Tab is the OS app switcher. `formatShortcut` builds the shortcut label for the search control and search panel.
* The editors ignore Ctrl+Tab: Lexical (MDXEditor) handles Tab only without Ctrl/Alt/Meta, so the event reaches `window`.
* Ctrl+Tab only reaches the page in the Electron desktop app. A normal browser (web build, remote-control client) uses Ctrl+Tab to switch its own tabs and never passes it to the page.

## Implementation details

* **Ctrl** in this feature means the physical Control key on every platform, including macOS. It does not mean `mod`.
* **Next / previous tab** means the neighbour of `activeDocument` in `openFilesService` `documents` order, which is the left-to-right tab order. Moving past the last tab wraps to the first tab; moving before the first wraps to the last.
* `keyboard_platform.ts`: add a required `ctrl: boolean` to `KeyboardShortcut`. `formatShortcut` shows `⌃` on Apple and `Ctrl` elsewhere when `ctrl` is set. On non-Apple platforms, `Ctrl` is shown once, even when `mod` is also set.
* `keyboard_shortcut_service.ts`, `matches`: set `expectedCtrl = binding.ctrl || (binding.mod && !applePlatform)`. Leave `expectedMeta` unchanged.
* Call sites of `KeyboardShortcut`:
  * `GLOBAL_SEARCH_SHORTCUT_BINDING` and the `commit` binding add `ctrl: false`. Their behavior does not change.
  * The search control and search panel call `formatShortcut`. Their labels do not change, because `ctrl` is false.
* `OpenFilesService`: add `activateAdjacentDocument(offset: 1 | -1)`.
  * Returns without change when `documents` is empty.
  * With no `activeDocument`, offset `1` activates the first document and `-1` the last.
  * Otherwise it activates `documents[(index + offset + length) % length]` through `activateDocument`. With one document this is the active document, so nothing changes and no `changed` event fires.
* New module `app/src/services/shortcuts/list_tab_shortcuts.ts` exports two bindings:
  * `NEXT_LIST_TAB_SHORTCUT_BINDING`: `{ alt: false, ctrl: true, id: 'list-next-tab', key: 'Tab', mod: false, shift: false, run }`.
  * `PREVIOUS_LIST_TAB_SHORTCUT_BINDING`: same, with `id: 'list-previous-tab'` and `shift: true`.
  * Both `run` callbacks call one module-level function `switchListTab(offset)`. It returns when `workspaceViewService.getSnapshot().viewMode !== 'text'`. Otherwise it calls `openFilesService.activateAdjacentDocument(offset)` and then `telemetryService.trackEvent('navigation')`, the same event a tab click sends.
* `TextView`: register both bindings in one `useEffect` with empty deps, and unregister both in its cleanup. `TextView` is mounted once, so the duplicate-ID check never fires.
* Focus does not move. The window listener catches the next Ctrl+Tab wherever focus is.
* Accepted edge cases:
  * Ctrl+Tab outside list view: the service still calls `preventDefault()` before `run` returns. In Electron that blocks no useful default.
  * While a dialog or the config page is open over list view, Ctrl+Tab still switches the tab behind it ("always respond").
  * Holding Ctrl+Tab: each key repeat switches one tab.
* Tests:
  * `keyboard_shortcut_service.node.test.ts`: a `ctrl` binding matches `ctrlKey` on both Windows and macOS, and does not match `metaKey` on macOS. Add `ctrl: false` to `createBinding`.
  * `keyboard_platform.node.test.ts`: `formatShortcut` renders a `ctrl` binding as `⌃…` on Apple and `Ctrl+…` elsewhere. Update existing calls with `ctrl: false`.
  * `open_files_service.node.test.ts`: next, previous, wrap at both ends, single document gives no `changed` event, no active document, empty list.
  * `text_view.grouped.test.tsx`: in text view mode, `userEvent.keyboard('{Control>}{Tab}{/Control}')` selects the next tab and Ctrl+Shift+Tab selects the previous one (checked with `aria-selected`); in cards view mode the active tab does not change.

## Acceptance criteria

* In list view in the desktop app, Ctrl+Tab selects the next tab, and the editor shows that document.
* Ctrl+Shift+Tab selects the previous tab.
* Ctrl+Tab on the last tab selects the first; Ctrl+Shift+Tab on the first selects the last.
* Works wherever focus is in list view, including inside the Markdown, action, and instruction editors and the file tree.
* On macOS the physical Ctrl key is used; Cmd+Tab is left to the OS.
* With zero or one open tab, the shortcuts do nothing and show no error.
* In board, diagram, and stats views, the shortcuts do not change the open list tabs.
* Global search (Ctrl+Shift+F / ⌘⇧F) and commit (Ctrl+S / ⌘S) keep working; the search shortcut label is unchanged.
* Known limit: in a normal browser (web build, remote-control client), the browser consumes Ctrl+Tab, so the feature works only in the Electron desktop app.
* New and updated tests listed above pass.