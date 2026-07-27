---
id: F-004
title: app layout
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 21a12220-2d7a-4e6b-a775-a289a13c6188
---

## Goal
Build the app entry point and main window: service startup, theme loading, main toolbar (collapsing to hamburger on mobile), left/right panels with splitter, status bar, keyboard status and running-agents indicator, optimized for both desktop and mobile.

## Current state
A React app (MUI) exists with GitHub authentication (`GithubAuthPanel`, `useGithubAuth`) and a basic `ProjectWorkspace` rendered inside a centered container in `App.tsx`. There is no application shell yet: no main window, no light/dark theme switching (only `CssBaseline`), no main toolbar, no left/right panels with splitter, no status bar and no keyboard/running-agents indicators.

## implementation details
- Add an app entry point that starts services and loads data before showing the main window; reuse the existing auth and project bootstrap.
- Load and manage a light/dark theme via an MUI `ThemeProvider`; persist the user's choice and expose a toggle from the toolbar.
- Add a main window that owns the global layout and switches between desktop and mobile presentations using MUI breakpoints.
- Add a main toolbar at the top; on mobile it collapses into a hamburger button that opens the left-panel content (tree or column names).
- Body uses a left panel and right panel separated by a draggable splitter on desktop; on mobile the left panel moves into the hamburger menu and the body fills the width.
- Add a status bar (desktop) showing editable info, keyboard status (caps lock, insert) and a running-agents count with a popup listing the running agents.
- Depend on data management ([[F-002]]) for project/card content; this feature only provides the shell and hosts card/tree/editor views.

## acceptance criteria
- The app starts services and loads the last project before the main window is shown.
- Light and dark themes can be toggled from the toolbar and the choice is remembered across restarts.
- On desktop the body shows a left and right panel with a working splitter; on mobile the left panel is reachable from the hamburger menu and the body is full width.
- The main toolbar is shown on desktop and collapses to a hamburger button on mobile.
- The status bar (desktop) shows info, keyboard status (caps lock, insert) and the number of running agents, with a popup listing them.
- The layout adapts correctly between desktop and mobile at the configured breakpoints.

## see also
- `design\architecture\initial description\app layout.md`
- `design\architecture\initial description\overview.md`
