---
author: 
id: F_361
internalId: 7a30a632-0da6-49e7-9948-f57f7d08f01c
title: On mobile dont show project name next to menu
status: ready
owner: 
affects:
agents:
  - design/activity/card__7a30a632-0da6-49e7-9948-f57f7d08f01c.json
policy:
after: cdc16a08-2bb4-4abe-a270-d35616a7ca06
branch: f_361_on_mobile_dont_show_project_name_next_to_menu
worktree: 2
changedFiles:
  - app/src/components/shell/menu/main_toolbar.grouped.test.tsx
  - app/src/components/shell/menu/main_toolbar.tsx
  - app/src/components/shell/mobile_main_window.grouped.test.tsx
  - app/src/components/shell/mobile_main_window.tsx
---
When the react app is in small screen mode, dont show the project folder name in the top bar, next to the menu tabs, but show it in hamburger menu, instead of ´theme´

## Current state

`MainToolbar` (`app/src/components/shell/menu/main_toolbar.tsx`) renders one `Toolbar` row for both screen sizes. It receives `isMobile` from `MainWindow`, which derives it from `useMediaQuery(theme.breakpoints.down('md'))` — "small screen mode" throughout this description means exactly that `isMobile === true`. On mobile the row starts with `MobileMenuButton` (the hamburger); on desktop that button is absent.

Between the tabs region and the trailing controls, `MainToolbar` always renders a `Box` with `data-testid="project-name-region"`, `flex: 1` and `justifyContent: 'center'`, holding `<ProjectNameLabel />` inside a `maxWidth: 240` box. That happens on mobile as well, so the project folder name currently sits next to the menu tabs on a narrow row that also has to fit the hamburger, the mobile action, and search.

`ProjectNameLabel` (`menu/project_name_label.tsx`) subscribes to project state through `useProjectState(service)`, returns `null` when no project is open, and otherwise renders a `Typography` (`variant="body2"`, `noWrap`, `data-testid="project-name-label"`) with `projectName(project)` — the repository name for GitHub projects, the last path segment of `rootPath` for local and remote projects (`menu/project_name.ts`).

The hamburger drawer lives in `MobileMainWindow` (`app/src/components/shell/mobile_main_window.tsx`). Its first row is a `justifyContent: 'space-between'` flex box containing a `Typography` with the literal text `Theme` on the left and `<ThemeModeToggle />` on the right, followed by the navigation region, `MobileProjectStatus`, and the GitHub auth footer. `ThemeModeToggle` is the only light/dark switch on mobile; `MainToolbar` renders `ThemeToggleButton` only in the `!isMobile` branch.

Tests that touch this area: `menu/main_toolbar.grouped.test.tsx` asserts the project-name region sits between the tabs region and the theme control (desktop render), `menu/project_name_label.grouped.test.tsx` covers the label itself, and `mobile_main_window.grouped.test.tsx` covers the drawer.

## implementation details

* In `main_toolbar.tsx`, render the `project-name-region` box only when `!isMobile`. Keep the desktop markup, sizing and centering exactly as today. Do not merely hide it with `display: none` — the label should not subscribe to project state on mobile at all, so the whole region stays unmounted.
* In `mobile_main_window.tsx`, replace the `Typography` holding the literal `Theme` in the drawer header with `<ProjectNameLabel />` (imported from `./menu/project_name_label`), keeping `<ThemeModeToggle />` in place on the right of the same row. The toggle button itself is not removed; only its text label is replaced by the project name. Its `aria-label` (`Switch to dark theme` / `Switch to light theme`) already names it, so no accessible name is lost.
* Because `ProjectNameLabel` returns `null` when no project is open, `justifyContent: 'space-between'` alone would pull the toggle to the left edge. Wrap the label in a `Box` with `flex: 1`, `minWidth: 0` and `overflow: 'hidden'` so the toggle keeps the right edge whether or not a project is open, and a long project name truncates (`noWrap` on the label) instead of pushing the toggle out of the drawer.
* Reuse `ProjectNameLabel` as-is; it already owns its own subscription, so the drawer does not republish project state and `MobileMainWindow` gains no new props or hooks. Do not add a second name-deriving code path — `projectName()` stays the single source.
* Tests: in `main_toolbar.grouped.test.tsx`, keep the existing centering test for the desktop render and add a mobile case asserting `queryByTestId('project-name-region')` is `null` while the hamburger (`Open menu`) is present. In `mobile_main_window.grouped.test.tsx`, add a case asserting the drawer header shows the project name (`project-name-label`) and no longer shows the text `Theme`, while the theme toggle button is still found by its `Switch to (dark|light) theme` accessible name; add a no-project case asserting the toggle still renders. Verify with `npm run typecheck` and the affected vitest suites (never `npm run build`).

## acceptance criteria

* In small screen mode (`isMobile`, viewport below the `md` breakpoint) the top bar shows no project folder name: `project-name-region` and `project-name-label` are both absent from the toolbar.
* On desktop the top bar is unchanged: the project name region still sits centered between the tabs region and the theme control, with the same 240px max width and truncation behaviour.
* Opening the hamburger menu on mobile shows the project folder name as the drawer's first row, in the position previously occupied by the word `Theme`; the word `Theme` no longer appears.
* The theme light/dark toggle remains in that same drawer row, on the right edge, with its existing accessible name and behaviour.
* With no project open, the drawer header row still renders and the theme toggle stays on the right edge; no placeholder name is shown.
* The displayed name matches `projectName()` for all project kinds: repository name for GitHub projects, last path segment of `rootPath` for local and remote projects; it updates when the active project changes, without reopening the drawer.
* A long project name truncates inside the drawer row rather than widening the drawer or pushing the toggle off screen.
* `npm run typecheck` passes; the main toolbar, project name label and mobile main window test suites pass.
