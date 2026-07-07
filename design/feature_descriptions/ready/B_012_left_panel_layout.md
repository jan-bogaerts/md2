---
id: B-012
title: left split panel hosts the auth panel instead of the tree/columns
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
`app layout.md` and F-004/F-006 define the desktop body as left panel (tree or column names) + right panel with a splitter, with the left content moving into the hamburger drawer on mobile. Actually `MainWindow` (`app/src/components/shell/main_window.tsx`) permanently pins `GithubAuthPanel` into the left splitter panel **and** the mobile drawer, while `TextView` embeds its own fixed-width, non-resizable tree inside the right panel. The F-006 acceptance criterion "Desktop layout uses the left splitter panel for the tree" fails, and the mobile hamburger shows auth instead of navigation.

## Fix
- Left panel content becomes view-dependent: text view → the file tree (moved out of `TextView` into the shared left panel, resizable via the existing `SplitLayout`); card view → column names/quick navigation (or collapse the splitter).
- Mobile drawer shows that same left-panel content (tree or column names), per design.
- Relocate `GithubAuthPanel` to a sensible home: the toolbar (account button/menu) or the project-open dialog (pairs with F-027/B-019).
- `TextView` receives the tree selection through props/service instead of owning the tree layout; tab behavior unchanged.

## acceptance criteria
- Desktop text view: tree lives in the left splitter panel and is resizable; editor/tabs fill the right panel.
- Mobile: the hamburger drawer shows the tree (text view) or column names (card view).
- Auth is still reachable (toolbar or dialog) in both modes.
- Tests cover left-panel content switching per view mode and the mobile drawer content.

## see also
- `design\architecture\initial description\app layout.md`
- `design\feature_descriptions\F_004_app_layout.md`
- `design\feature_descriptions\F_006_text_view.md`
