---
author: 
id: F_236
internalId: b632dc97-1096-488d-aae6-82c1516fa0b0
title: add support for ctrl+s
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__b632dc97-1096-488d-aae6-82c1516fa0b0.json
policy:
after: dbb1430f-c4ad-46ec-a77e-8de4f98322cd
---
shortcut to save / commit the project.

make certain that the shortcut is shown in the tooltip of the button on the app bar.

## Current state

`AppMenu` renders a `Commit` button in the app bar. It is enabled only when a writable, loaded project has pending changes and no project operation is running. Clicking it calls `projectSessionService.commit()`, which flushes Markdown editor drafts, action drafts, queued file changes, and active storage writes through `ProjectPersistenceService`.

No global Ctrl+S handler exists, so the browser or Electron host receives the shortcut. The Commit button uses `MenuIconButton`, whose tooltip and accessible name both come from one `label` prop; its tooltip currently says only `Commit`.

## implementation details

* In `app/src/components/shell/menu/app_menu.tsx`, derive one `canCommit` value and use it for both Commit button state and shortcut handling.
* Register a window `keydown` listener while `AppMenu` is mounted. For Ctrl+S without Alt, Meta, or Shift, prevent the browser's Save Page action. When `canCommit` is true, call the existing commit handler; when false, perform no commit. Remove listener on unmount. Shortcut remains global while focus is inside an editor or other control.
* Keep click and keyboard paths identical: both call `projectSessionService.commit()`, retain existing error reporting, and cannot start while Commit button is disabled.
* Extend `MenuIconButton` with separate optional tooltip text while preserving `label` as button's accessible name. Set Commit tooltip to `Commit (Ctrl+S)`. Verified call sites for Open project, Push, Pull, Config, and Complete release keep current tooltip behavior.
* Update focused tests in `app/src/components/shell/menu/app_menu.test.tsx` for shortcut execution, disabled states, browser-default prevention, listener cleanup, and tooltip text. Test `MenuIconButton` separately only if tooltip/accessibility behavior cannot be covered clearly through `AppMenu`.

## acceptance criteria

* Pressing Ctrl+S anywhere in focused app commits all pending project changes through same operation as clicking Commit.
* Shortcut works while focus is in Markdown editor, action editor, input, or other app control.
* Ctrl+S prevents browser or Electron Save Page behavior.
* Ctrl+S does not commit when no project is open, project is read-only, loading is active, or no changes are pending; behavior matches disabled Commit button.
* Alt+Ctrl+S, Meta+S, and Ctrl+Shift+S do not trigger this shortcut.
* Commit button tooltip displays `Commit (Ctrl+S)`, while button accessible name remains `Commit`.
* Other `MenuIconButton` tooltips and actions remain unchanged.
* Re-rendering or unmounting `AppMenu` does not leave duplicate or stale keyboard listeners.
