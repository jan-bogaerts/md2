---
author: 
id: J_63
internalId: 7a123557-495a-47b1-9c18-437364ff3825
title: keyboard service owns shortcuts
status: ready for implementation
owner: 
affects:
agents:
policy:
after: 90ca85d7-9878-4238-a36b-f662d0c8fbd8
branch: j_63_keyboard_service_owns_shortcuts
worktree: 2
---

Keyboard shortcuts are currently registered from React components (`.tsx` files), through a mix of `KeyboardShortcutService` bindings and raw `window` `keydown` listeners. Each handler decides on its own whether it applies, using `viewMode` checks, focus checks, or nothing at all.

The keyboard service must become the one place that handles keyboard shortcuts, including their registration:

* Services own shortcut registration, not components. No shortcut registration in `.tsx` files.
* A global keyboard service owns the app-wide shortcuts (for example Ctrl+S commit, global search), not a component.
* One sub keyboard service per view: dashboard (cards), text, stats, diagram, ...
* The global keyboard service monitors which view is active and loads the matching sub keyboard service. Only the sub keyboard service of the active view handles keys.

## Current handlers

| Shortcut | Registered in | Mechanism |
|---|---|---|
| Ctrl+S commit | `app/src/components/shell/menu/app_menu.tsx` | `KeyboardShortcutService` |
| Global search | `app/src/components/shell/main_window.tsx` | `KeyboardShortcutService` |
| Ctrl+Tab / Ctrl+Shift+Tab list tabs | `app/src/components/text_view/text_view.tsx` | `KeyboardShortcutService`, `viewMode` check inside `run` |
| Caps Lock / Insert status | `app/src/components/shell/keyboard_status.tsx` | raw `window` listener |
| Delete (diagram selection) | `app/src/components/diagram_view/editing/use_diagram_delete_key.ts` | raw `window` listener, focus check |
| Escape (new diagram gestures, emphasis) | `app/src/components/diagram_view/surface/diagram_zoom_viewport.tsx` | raw `window` listener |
| Escape (current diagram pan, emphasis) | `app/src/components/diagram_view/surface/diagram_current_viewport.tsx` | raw `window` listener |
| Escape (commit diff panel) | `app/src/components/card_view/list_card_commit_diff_panel.tsx` | raw `window` listener, capture phase, `stopPropagation` |
| Escape (markdown local search) | `app/src/components/editor/local_search/markdown_local_text_search_plugin.tsx` | raw `window` listener |

Related: [F\_445](F_445_diagrams_delete_key.md), [F\_446](F_446_diagrams_control_key.md), [F\_447](F_447_diagram_add_tool_escape_key.md).
