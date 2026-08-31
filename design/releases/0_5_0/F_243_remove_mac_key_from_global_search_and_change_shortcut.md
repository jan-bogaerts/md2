---
author: 
id: F_243
internalId: 933da3dd-6634-467f-bd86-e3205f22da5d
title: remove mac key from global search and change shortcut
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__933da3dd-6634-467f-bd86-e3205f22da5d.json
policy:
after: 573854b5-fd44-4868-918e-56fdb505a905
---
it shows the mac key while we are on windows. the mac key can be shown when running on mac, but not for windows users. when on electron, we should know the os, not certain when on browser.

at least on windows, lets use shift+ctrl+F to search

## Current state

**Global search** is the project-wide search in the top shell (`app/src/components/shell/search/search_control.tsx`, `search_panel.tsx`), as opposed to **editor-local search**, the Ctrl+F find inside one markdown editor (`app/src/components/editor/markdown_local_text_search_plugin.tsx`).

The `⌘K` badge is hard-coded twice, as a literal string inside an `InputAdornment`: `search_control.tsx:79` (collapsed launcher) and `search_panel.tsx:199` (expanded panel). It renders the mac Command glyph on every platform because no platform check exists anywhere in `app/src` — a grep for `navigator.platform` and `navigator.userAgentData` returns nothing. `isElectron` (`app/src/services/electron_lifecycle_bridge.ts:29`) only distinguishes Electron from browser, never the operating system.

The badge also promises a shortcut that does not exist. Four window-level `keydown` listeners live in the app and none of them opens global search: `keyboard_status.tsx:19` (Caps Lock indicator), `app_menu.tsx:201` (Ctrl+S commit), `list_card_commit_diff_panel.tsx:27` (Escape closes the diff, capture phase), and `markdown_local_text_search_plugin.tsx:113` (Escape closes the editor-local search popup; its Ctrl+F and F3 arrive through the Lexical `KEY_DOWN_COMMAND` registration at `:104`, not through `window`). So pressing Ctrl+K or ⌘K today does nothing.

Global search can currently be opened only by pointer. On desktop, `SearchControl` keeps a `desktopOpen` state; the collapsed field is a read-only `TextField` whose `onFocus` calls `openDesktop`, which swaps in `SearchPanel`; `SearchPanel` then focuses its input from an effect on `controlElement` (`search_panel.tsx:210-212`). On mobile, an icon button stores its own element as the `Popover` anchor. Neither path is reachable from outside the component: there is no service, no event, no imperative handle.

Shortcut ownership is therefore scattered. Each feature adds its own `window.addEventListener('keydown', …)` with its own inlined modifier test, there is no registry to inspect for conflicts, and the displayed label and the handler that implements it live in different files with nothing tying them together — which is exactly how `⌘K` drifted into showing a key nobody handles.

Platform detection belongs on the client: the renderer is Chromium in both Electron and the browser, so `navigator` answers correctly in both, and for the served browser app it describes the machine holding the keyboard rather than the host — which is the correct answer for a keyboard hint.

## implementation details

* Add `app/src/services/shortcuts/keyboard_platform.ts`. `isApplePlatform()` reads `navigator.userAgentData?.platform` and falls back to a `/Mac|iPod|iPhone|iPad/` test on `navigator.userAgent`. `formatShortcut(binding)` renders a binding as `⌘⇧F` on mac and `Ctrl+Shift+F` everywhere else. No Electron preload change is needed.
* Add `app/src/services/shortcuts/keyboard_shortcut_service.ts`: one module owning one `window` `keydown` listener for the whole app. It holds a registry of bindings `{ id, key, mod, shift, alt, run }`, where **mod** means Meta on mac and Ctrl elsewhere. `register(binding)` returns an unregister function; the listener is attached on the first registration and removed when the last one leaves, so an app with no bindings has no listener. A duplicate `id` throws. On a match — key compared case-insensitively, modifier set compared exactly, so Ctrl+F never satisfies a Ctrl+Shift+F binding — it calls `run()` and calls `preventDefault()`. The service performs no work itself; it only asks the owning service to act.
* Add `app/src/services/search/search_open_service.ts`, an `EventTarget` with `requestOpen()` dispatching a granular `openRequested` event. `SearchControl` subscribes in an effect and opens itself: on desktop it sets `desktopOpen`, on mobile it opens the popover. Mobile needs an anchor that exists before any click, so `SearchControl` keeps a ref to its icon button and uses that element as the anchor when the request arrives.
* Define the global-search binding once, in a single exported constant next to the search service, and use it for both registration and badge rendering, so label and handler cannot drift again. Key `f`, `mod` and `shift` — Ctrl+Shift+F on Windows and Linux, ⌘⇧F on mac.
* Register the binding from the shell (`main_window.tsx`) in an effect that unregisters on unmount, with `run` calling `searchOpenService.requestOpen()`.
* Replace the literal `⌘K` at `search_control.tsx:79` and `search_panel.tsx:199` with `formatShortcut` of that binding.
* Migrate the Ctrl+S commit shortcut (`app_menu.tsx:192-203`) to the registry as the second consumer, keeping the `canCommit` guard inside its `run`. This is deliberate scope: one consumer does not prove a shared registry. The editor-local Ctrl+F/F3 handlers and the two Escape closers stay where they are — they are focus-scoped and priority-ordered, not global, and moving them would change which handler wins.
* The global-search shortcut fires even while a text field or markdown editor has focus, since Ctrl+Shift+F has no editing meaning in this app; `preventDefault` stops the host browser or Electron default. Closing behaviour (blur, Escape) is unchanged.
* Tests: `keyboard_shortcut_service.node.test.ts` for register/unregister, mac-versus-Windows modifier mapping, exact-modifier matching, listener absence when empty, duplicate-id rejection; `keyboard_platform.node.test.ts` for both badge strings; `search_control.test.tsx` for the shortcut opening and focusing search on desktop and mobile and for the platform-dependent badge; `app_menu.test.tsx` updated for the migrated Ctrl+S path.

## acceptance criteria

* No mac-only glyph appears on Windows or Linux. The badge in both the collapsed launcher and the expanded panel reads `Ctrl+Shift+F` there, and `⌘⇧F` on mac, in Electron and in the served browser app alike, decided by the client's own platform.
* Pressing Ctrl+Shift+F (⌘⇧F on mac) opens global search and puts the caret in its input, from anywhere in the app, including while a markdown editor or another text field has focus. The host default for that combination does not also run.
* The same shortcut works in the mobile layout, opening the search popover anchored to the search icon.
* Ctrl+K and ⌘K no longer appear anywhere in the interface, and the badge names exactly the combination the handler implements — both are derived from one binding definition.
* Ctrl+F inside a markdown editor still opens editor-local search and still does not open global search; F3, and Escape closing the editor-local popup or the commit diff panel, are unchanged.
* Exactly one `window` `keydown` listener serves global shortcuts, owned by the shortcut module. It dispatches to the owning service and contains no feature logic, and it attaches only while at least one binding is registered.
* Ctrl+S still commits when a project has uncommitted changes and still does nothing otherwise, now through the registry.
* Registering two bindings with the same id fails loudly rather than silently replacing one.