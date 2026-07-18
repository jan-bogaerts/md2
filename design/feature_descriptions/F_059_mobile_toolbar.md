---
id: F_059
title: mobile toolbar
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

When in `mobile` mode (small window), we need to adjust the layout of the toolbar a little bit in order to better fit mobile usage:
- on the `home` tab, the toggle buttons to select between 'board' and 'list' should be first, then followed by open-project & branch select.
- 'new action' and 'new card' should be hidden on the `home` tab, instead a '+' icon should be placed in front of the 'search' icon (aligned to the right at the tabs bar to switch between 'home' and 'run')
- the avatar icon for setting up the access token for github, should be hidden on the 'home' tab' and instead be placed at the bottom of the hamburger menu

## Current state

`AppMenu` renders the same Home ribbon on desktop and mobile: Project, Settings, View, New action, New card and GitHub account. On mobile, `MainToolbar` already shows the hamburger and Search icon, while the drawer contains only theme controls and project navigation. The ribbon order and width are therefore not optimized for small screens, and GitHub authentication is not available from the drawer.


## implementation details

- In the mobile Home ribbon, render the Board/List toggle first, followed by Open project and the branch selector. Keep the desktop order unchanged.
- Hide New action, New card and the GitHub account button from the mobile Home ribbon.
- Add an accessible `+` icon button immediately before Search in the mobile top row. It opens a menu with `New action` and `New card`, reusing their existing handlers and disabled states.
- Add the existing GitHub account control to a footer pinned to the bottom of the mobile hamburger drawer.
- Add responsive tests for the control order, create menu actions and drawer account entry; retain the existing desktop behavior tests.

## Acceptance criteria

- On mobile Home, Board/List appears before Open project and the branch selector.
- New action, New card and GitHub account are absent from the mobile Home ribbon.
- The `+` button is immediately before Search and opens a menu containing New action and New card; each item has the same availability and behavior as its desktop button.
- GitHub account setup remains available at the bottom of the mobile hamburger drawer.
- Desktop Home and the Run tab keep their current layout and behavior.


## See also
