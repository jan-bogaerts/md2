---
id: F-017
title: search
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 3cd255e2-2f84-42cc-ab2f-1833531efa73
---

## Goal
Add an easy-to-access text search (with optional RegExp mode and agent-built expressions) over cards, history and other special folders, with grouped results and navigation to the matching card or file, integrated into the borderless window's drag bar area.

## Current state
There is no search feature: no search service or module, no search UI, no RegExp handling and no agent-built expression flow. The initial description assumed history is "not loaded", but that is no longer true — the data the search needs is already in memory.

The parsed project data is available through `useProjectState()`, which returns the `DataService` state including a `ProjectSnapshot` with `activeCards`, `backgroundCards` and `workingFolder`. `markdownParsingService.splitCards` already splits files into active vs background using `isRootWorkingFolderFile` (root markdown files under the working folder are active; everything in subfolders is background), and produces `ProjectCard` objects with `content` (body only), a parsed `header` (`CardHeader`: id, title, status, owner, affects, policy, etc.), `isActive` and `path`. A search module can consume this snapshot directly; frontmatter parsing already lives in `markdown_parsing_service.ts` and must not be duplicated. Background results are not currently grouped by their first subfolder anywhere.

The top shell is `MainToolbar` (MUI `AppBar`/`Toolbar`) rendered by `MainWindow`; it holds the "MD²" title, a config `IconButton` and a `toolbarAction` slot (currently `<ThemeControls />` from `app.tsx`). There is no search input in the toolbar. The desktop window is borderless via Electron `titleBarStyle: 'hidden'` with a `titleBarOverlay` in `desktop/main.js`; there is no manual CSS drag region (`-webkit-app-region`) anywhere in the React shell, so a custom drag bar and its non-draggable input/button zones do not yet exist.

Navigation into a card/file is local to `ProjectWorkspace`, which owns `viewMode` (`'cards' | 'text'`). `handleOpenInFileMode(path)` sets a `requestedPath` + `requestedNonce` and switches to text view; `TextView` opens that path as a tab via `useOpenTabs` and can browse background files through its file tree. There is no shared/global "navigate to card or file, keeping current view" API — selecting a background result without changing view mode is not currently supported. Routing exists via `app_navigation` (`navigateTo` / `useAppLocation`, with a `/config` route), but nothing search-related uses it.

There is no agent infrastructure wired up: `App` passes `agents={[]}` to `MainWindow`, so agent-built RegExp has no existing execution path to reuse. No tests cover search.

## implementation details
- Add a search service or pure search module in `app/src/` that searches the loaded `ProjectSnapshot`; keep storage-specific file loading in the existing GitHub/local storage services.
- Search active root cards by full body content and header fields by default. Search background cards from subfolders by header fields by default, with an option to include full body content. Use `ProjectCard` data produced by the shared parsing service; the search module must not parse frontmatter itself.
- Support plain case-insensitive contains search and an explicit RegExp mode. Invalid expressions must show a clear validation error and keep previous results stable.
- Group results with active cards first, then background results grouped by first folder under the working folder, such as `history` or `architecture`.
- Each result shows the card/file title, path, match context and whether the match came from header or body.
- Selecting a result navigates to the matching card or file in the current workspace view. If the file is a background card, make it selectable without changing the user's current view mode.
- Add the search input and controls to the top shell area while preserving drag behavior in the borderless Electron window; text inputs and buttons must remain non-draggable.
- Agent-built RegExp generation is a separate action from manual search input and must surface agent failures without changing the current query.
- Tests should cover search matching/grouping, RegExp validation, full-body background search toggling, result selection and toolbar drag/non-drag behavior.

## acceptance criteria
- A user can run a plain text search from the top shell area without breaking window dragging in the desktop app.
- Active cards are searched by full content and appear before background/special-folder results.
- Background cards from history, architecture and other subfolders are searchable by header fields; enabling full search includes their body content.
- RegExp mode returns matches for valid expressions and reports invalid expressions without crashing or clearing the current query.
- Results are grouped by active cards and by special folder name, with enough context to identify the match.
- Clicking a result opens/selects the matching card or file while keeping the current workspace view.
- Agent-built RegExp can populate the query when successful and leaves the existing query unchanged on failure.
- Unit and React tests cover the search module, grouped result rendering, result navigation and shell search controls.

## see also
- `design\architecture\initial description\search.md`
- `design\architecture\parsing_service.md`
