---
author: 
id: B_320
internalId: 1deced87-bdc6-46cb-9360-356355f1675d
title: project color applied to wrong components
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__1deced87-bdc6-46cb-9360-356355f1675d.json
policy:
after: 35e2668b-44b4-4be8-9a82-cc3c7f2b4003
changedFiles:
  - app/src/theme/app_theme.node.test.ts
---

We have the option to assign a 'color' to a project (in the config dialog). this works, however, it is applied to the cards and the menu bar. It should actually be applied to the background of the  dashboard, stats, diagrams, list views

## Current state

* The project "color" is the config entry `project.backgroundShade` (`app/src/services/config/config_entries.ts`, label `Background shade`). Its values are `neutral`, `blue`, `green`, `red`, `purple` and `amber` (`app/src/theme/project_background_shade.ts`).
* `AppThemeProvider` (`app/src/theme/theme_provider.tsx`) reads the shade from `useProjectConfig()` and passes it to `createAppTheme` (`app/src/theme/app_theme.ts`).
* In `paletteForMode`, the shade picks one entry from `LIGHT_PROJECT_BACKGROUNDS` or `DARK_PROJECT_BACKGROUNDS`. That entry replaces **both** MUI tokens `palette.background.default` and `palette.background.paper`. Both tokens are global, so every component that uses either one gets tinted.
* `background.paper` is used by surfaces that should stay neutral. Examples: the card surface `CardDragSurface` in `project_card_drag_container.tsx`, the menu bar in `app_menu.tsx` and `menu.tsx`, the status bar in `status_bar.tsx`, dialogs, popovers, and the text editor `Paper` in `project_workspace.tsx`. This causes the bug: the user sees the tint on cards and the menu bar.
* The view roots already use `background.default`: `card_view.tsx` (desktop board), `mobile_card_view.tsx`, `stats_view.tsx` and `diagram_view.tsx`. The text view has no background of its own. It shows the `body` background, which `CssBaseline` sets to `background.default`. Because the `default` tint differs only slightly from neutral, and `background.default` is also used by many non-view parts (for example dialog footers and the search field), the tint on views is hard to see.

## Decisions

* "Dashboard" means the card board view, on desktop and mobile. "List views" means the text view: the file tree plus the editor panel area.
* Add a separate, view-only theme token: `palette.custom.projectBackground`. `background.default` and `background.paper` become neutral again for every shade.
* Keep the existing tint values. The current `default` hex value of each shade becomes that shade's `projectBackground`.

## Implementation details

### Theme

* `app/src/theme/mui.d.ts`: add `projectBackground: string` to `CustomPalette`.
* `app/src/theme/app_theme.ts`:
  * Change `LIGHT_PROJECT_BACKGROUNDS` and `DARK_PROJECT_BACKGROUNDS` to `Record<ProjectBackgroundShade, string>`. Each value is the current `default` hex of that shade.
  * Add named constants `LIGHT_BACKGROUND = { default: '#f4f6f8', paper: '#ffffff' }` and `DARK_BACKGROUND = { default: '#10151c', paper: '#1a212b' }`. These are the current `neutral` values. In `paletteForMode`, `background` always uses these constants.
  * Set `custom.projectBackground` to the shade's tint for the current mode.
* `createAppTheme`, `AppThemeProvider` and the config entry keep their signatures. The shade is still read from the project config.

### View roots (switch to `custom.projectBackground`)

| File | Element |
|---|---|
| `components/card_view/card_view.tsx` | root `Box`: `bgcolor: 'background.default'` |
| `components/card_view/mobile_card_view.tsx` | root `Box`: `bgcolor: 'background.default'` |
| `components/stats_view/stats_view.tsx` | root `Box`: `bgcolor: 'background.default'` |
| `components/diagram_view/diagram_view.tsx` | root `Box`: `bgcolor: 'background.default'` |
| `components/shell/split_layout.tsx` | root `Box`: add `bgcolor` (only call site is the desktop text view in `project_workspace.tsx`) |
| `components/shell/mobile_layout.tsx` | root `Box`: add `bgcolor` (only call site is the mobile text view in `project_workspace.tsx`) |

The text view's file tree panel (`action.hover`) and editor `Paper` stay as they are. The tint shows in the layout area around them.

### Diagram surface masks

These elements are painted over the diagram surface so that they hide lines behind them. If they keep using `background.default`, they will show as neutral patches on the tinted surface. Switch each of them to `custom.projectBackground`:

* `components/diagram_view/rendering/diagram.tsx`: the sticky header `Box`.
* `components/diagram_view/editing/editable_diagram.tsx`: the sticky header `Box`.
* `components/diagram_view/rendering/diagram_edge.tsx`: the edge label background `fill`. Use `theme.palette.custom.projectBackground`.
* `components/diagram_view/rendering/diagram_group.tsx`: the group label `Typography`.
* `components/diagram_view/rendering/sequence_fragment.tsx`: the fragment operator label.
* `components/diagram_view/rendering/diagram_node.tsx`: the hollow `end` node fill.
* `components/diagram_view/formatting/diagram_role_style.ts`: the `boundary` role `bgcolor`.

Leave every other use of `background.default` and `background.paper` unchanged. This includes dialog footers, popovers, the creation tool sample in the menu, the search field and conversation events.

### Edge cases

* `neutral` shade: `projectBackground` equals the neutral `default`, so nothing changes visually.
* Light/dark toggle: the token is rebuilt with the theme, so no extra handling is needed.
* No project open (`useProjectConfig()` returns `undefined`): the shade falls back to `neutral`, same as today.
* Shade changed in the config dialog: `useProjectConfig` already compares `backgroundShade`, so the theme rebuilds and the views update live.

### Tests

* `app/src/theme/app_theme.node.test.ts`: add a test that `background.default` and `background.paper` are the same for every shade, in both modes. Add a test that `custom.projectBackground` differs between `neutral` and a non-neutral shade, in both modes.
* Do not add component tests that assert hex values (these are visual constants).
* Run `npm run test -- src/theme/app_theme.node.test.ts src/theme/theme_provider.test.tsx`, then `npm run typecheck` and `npm run lint` in `app/`.

## Acceptance criteria

* With a non-neutral shade selected, cards, the menu bar, the status bar, dialogs and popovers have the same background as with `neutral`.
* With a non-neutral shade selected, these backgrounds show the tint: the card board (desktop and mobile), the stats view, the diagrams view, and the text view layout area.
* In the diagrams view, edge labels, group labels, fragment labels, sticky headers, `end` nodes and `boundary` nodes blend with the tinted surface. No neutral patches appear.
* Changing the shade in the config dialog updates the tinted views without a reload. Other surfaces stay unchanged.
* This works in both light and dark mode.
* The `neutral` shade looks the same as before this change.
* The new theme tests pass. Typecheck and lint pass.
