---
id: B-019
title: project open/create controls permanently occupy the workspace
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
The owner/repository/branch fields, open buttons, push-mode select and new-card row are always rendered above the card/text views in `ProjectWorkspace`. The design puts create/open/switch-branch in menus (`data management.md`: "allow switch branch from menu"; config.md pattern). The permanent form wastes vertical space on every screen — especially mobile — and mixes rarely-used setup controls with the daily working surface.

## Fix
- Move open/create project into a dialog reachable from the toolbar (project menu button), combined with the F-027 repository/branch pickers.
- Branch switch and push become toolbar/menu commands shown only when a project is open (push only in manual mode, as today).
- New-card entry moves to a compact affordance in the card view (e.g. "+ card" per column or a single toolbar button opening a small dialog with title/type/body).
- The workspace body then contains only the view toggle and the active view.

## acceptance criteria
- With a project open, no setup fields are visible in the body; open/create/switch/push are reachable from the toolbar/menu.
- With no project open, a clear empty state offers "Open project…".
- New cards can still be created in ≤2 interactions.
- Mobile layout gains the reclaimed space; tests cover the dialog flow and empty state.

## see also
- `design\feature_descriptions\F_027_repository_branch_selection.md`
- `design\feature_descriptions\F_004_app_layout.md`
