---
author: 
id: J_27
internalId: 34581d14-8a7c-4f5c-8cf3-b9137260221d
title: Markdown editor context menu
status: new
owner: 
affects:
agents:
policy:
after: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
---

Add clipboard commands to the Markdown editor context menu while keeping context-menu composition separate from spellchecking.

## Current state

`MarkdownEditor` handles Markdown-aware Copy and Paste through its Lexical plugin. Ctrl+C copies Markdown, Ctrl+Shift+C copies rendered text, Ctrl+V imports Markdown, and Ctrl+Shift+V inserts literal text. Cut retains Lexical's existing behavior.

In Electron, `spellcheck.js` owns the only `webContents` context-menu listener and builds a menu containing spelling suggestions, dictionary actions, and spelling languages. It does not include clipboard commands. In a regular browser, the browser owns the native context menu and already supplies Cut, Copy, Paste, and browser spelling actions. A web application cannot add MD²-specific entries to that native menu.

## Implementation details

* Add a dedicated Electron text-context-menu module under `desktop/src/shell/`. It owns the `webContents` context-menu listener and composes independent editing and spelling sections.
* Keep `desktop/src/integrations/spellcheck.js` responsible only for spellchecking. It exports the spelling menu-section builder and language behavior; it must not contain Cut, Copy, Paste, clipboard access, or general menu composition.
* The Electron editing section contains Cut, Copy, Copy as Text, and Paste. Use Electron's native roles for Cut, Copy, and Paste so they issue normal editing commands to the focused renderer. Use `params.editFlags` for availability.
* Electron Copy continues through the existing Markdown-aware copy event. Copy as Text writes the rendered `params.selectionText` as plain text and is unavailable when there is no textual selection. Paste continues through the existing Markdown-aware paste event. Cut keeps Lexical's current behavior; this job does not make Cut Markdown-aware.
* The context-menu module owns section ordering and separators. Spelling suggestions and Add to Dictionary remain grouped together; editing commands form a separate group; Spelling Languages remains a spelling action.
* Update `desktop/main.js` to register the new context-menu owner and provide its Electron menu, clipboard, and spell-language dependencies. Remove spellcheck's standalone context-menu registration.
* In regular browsers, preserve the native context menu. Do not add a React context menu and do not call `preventDefault` for Markdown-editor context-menu events. Native Cut, Copy, and Paste continue to emit the clipboard events handled by the existing editor plugin.
* Copy as Text is intentionally not present in the browser context menu. Ctrl+Shift+C remains available in browsers. This job does not add a toolbar or overflow-menu replacement.
* Add focused desktop tests for editing-section availability, spelling/editing composition, separator placement, native roles, Copy as Text, read-only selections, and empty menus. Preserve the existing focused Markdown clipboard tests.

## Acceptance criteria

* In Electron, right-clicking editable Markdown shows Cut, Copy, Copy as Text, and Paste together with applicable spelling actions.
* Electron Copy produces the same Markdown clipboard payload as Ctrl+C. Copy as Text produces the same visible plain text as Ctrl+Shift+C. Paste uses the same Markdown-aware behavior as Ctrl+V.
* Electron Cut keeps its current Lexical behavior and is disabled when the selection cannot be cut. Paste is disabled when Electron reports that it cannot paste.
* A read-only Markdown selection in Electron offers Copy and Copy as Text, but not Cut or Paste.
* Spelling code contains only spelling concerns. The dedicated context-menu module owns registration, editing commands, section composition, and separators.
* In a regular browser, the native context menu remains available with the browser's Cut, Copy, Paste, and spelling actions. Copy and Paste continue through MD²'s existing Markdown clipboard handlers.
* Copy as Text is absent from the browser context menu, while Ctrl+Shift+C continues to work.
* Right-clicking content with no applicable editing or spelling action does not open an empty Electron menu.
