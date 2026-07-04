---
id: F-006
title: text view
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Implement the text view: a folder/status tree on the left (including special folders) and tabbed open files on the right, with mobile behavior that moves the tree into the hamburger menu.

## Current state
The app shell ([[F-004]]) provides a desktop splitter and mobile hamburger drawer, but the left panel currently contains GitHub authentication instead of the text tree. `ProjectWorkspace` renders active root cards as a flat button list and edits one selected card in a plain textarea; there are no file tabs, no folder/status tree, and no route or mode switch for text view. `DataService` loads markdown files recursively from the working folder and splits them into active root cards and background subfolder cards, but it does not expose a tree model, open-file state or special-folder metadata.

## implementation details
- Add a text-view mode hosted by `ProjectWorkspace` or a dedicated child component, keeping project open/create and branch/push controls available.
- Build a tree model from the loaded markdown files: real folders, special folders from [[F-003]], and status groupings for active cards.
- Selecting a file opens it in the right pane as a tab; selecting an already-open file activates its existing tab.
- switching tabs selects the file in the tree on the left pane.
- Tabs show the file title/id when available and support close/activate behavior without losing unsaved auto-save behavior from `DataService.saveFile`.
- Reuse the markdown editor surface from [[F-007]] when available; until then the text view can keep the existing textarea editing path.
- On desktop, show the tree in the left split panel and tabs/editor in the right panel. On mobile, move the tree into the hamburger drawer and keep the active tab/editor full width.
- Preserve loading behavior: root cards stay available first, while subfolder/special-folder files appear when background cards are loaded.

## acceptance criteria
- Opening a project shows a text view with a navigable tree containing folders, markdown files, special folders and status groups.
- Clicking a markdown file opens it in a tab; clicking it again focuses the existing tab instead of duplicating it.
- Multiple files can be open, switched between and closed from the tab bar.
- Editing the active tab persists through the existing data service save/commit flow.
- Desktop layout uses the left splitter panel for the tree and the right panel for tabs/editor.
- Mobile layout puts the tree in the hamburger drawer and keeps the selected file editor full width.
- Root files are usable before subfolder files finish loading, and subfolder/special-folder files appear without replacing active tabs.
- Tests cover tree construction, tab open/close/focus behavior and desktop/mobile rendering.

## see also
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\app layout.md`
