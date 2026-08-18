---
author: 
id: F_207
internalId: 09e88f16-8fa7-423c-8fdf-aac61d9bf252
title: Dense menus
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__09e88f16-8fa7-423c-8fdf-aac61d9bf252.json
policy:
---

Make all menus and context menus dense.

Add design rule for this

Here, **dense** means MUI's built-in compact menu layout: `MenuItem` minimum row height drops from 48px to 36px and vertical padding tightens, so more items fit in the same space. **Menu** = a MUI `Menu` dropdown opened from a button (e.g. Project menu, mobile Create menu). **Context menu** = the same `Menu` opened on right-click via `anchorReference="anchorPosition"` (e.g. file-tree row, board card). Both render a `MenuList` of `MenuItem`s, so both are covered by one theme rule.

## Current state

Menus and context menus are built from MUI `Menu` + `MenuItem` with no density set, so every item uses MUI's default comfortable height (48px). None of these call sites pass `dense` or `MenuListProps={{ dense: true }}`:

- **Button dropdowns:** `project_toolbar_menu.tsx` (Project menu), `shell/menu/mobile_create_menu.tsx` (mobile Create), `worktree_selector.tsx`.
- **Row / context menus:** `text_view/file_tree_node_row.tsx` (⋮ button menu and right-click context menu, both feeding shared `card_view/card_path_menu_items.tsx` and `actions/run/trigger/action_entry_points.tsx` `menuItems` variant), `card_view/project_card_view.tsx` and `card_view/project_card_drag_container.tsx` (board card context menu), `card_view/mobile_card_view_menu.tsx`, `card_view/card_view_navigation.tsx`.
- **Editor / results menus:** `editor/markdown_placeholder_menu.tsx`, `actions/agent/action_agent_selectors.tsx`, `shell/search/search_results.tsx`.
- **Select option lists:** `shell/menu/menu_select.tsx`, `shell/menu/branch_menu_select.tsx`, `card_view/card_state_selector.tsx`, config and card-properties `Select`s — these render their options as `MenuItem`s inside a `Menu` popover, so today they share the same comfortable height.

There is a single shared theme (`app/src/theme/app_theme.ts`, `createAppTheme`) whose `components` block already sets defaults/overrides for `MuiButton`, `MuiIconButton`, `MuiPaper`, `MuiTextField`, etc., but has **no** `MuiMenu` / `MuiMenuItem` entry. The design rules doc is `design/STYLE_GUIDE.md`; §8 "Component conventions" documents Select, Dialog/popup, etc., but says nothing about menu density.

Note: the top toolbar shell component `app/src/components/shell/menu/menu.tsx` (imported as `./menu`) is a horizontal ribbon container, **not** a dropdown `Menu`, and is out of scope.

## implementation details

- Add one global rule to `createAppTheme` in `app/src/theme/app_theme.ts` so density is defined in exactly one place (the theme is the source of truth per `STYLE_GUIDE.md`): set `MuiMenuItem: { defaultProps: { dense: true } }`. This forces the compact 36px layout on every `MenuItem` regardless of which menu contains it, including context menus and `Select` option lists, because `MenuItem` honours its own `dense` prop over the list context.
- Optionally also set `MuiMenu: { defaultProps: { MenuListProps: { dense: true } } }` to tighten the `MenuList` wrapper padding to match; keep the `MuiMenuItem` default as the primary mechanism so context menus opened by `anchorPosition` (which still use `MuiMenu`) and stray `MenuItem`s stay dense even if a call site overrides `MenuListProps`.
- Do **not** add per-menu `dense`/`MenuListProps` at call sites. Remove any that would now be redundant. Density must come from the theme so future menus inherit it automatically.
- Keep all existing menu behaviour unchanged: anchoring, `anchorReference`/`anchorPosition` context-menu placement, `ListItemIcon` icons, disabled items, `error.main` destructive items, dividers, and the `ActionEntryPoints` `menuItems` variant. Only row height and vertical padding change.
- Add the design rule to `design/STYLE_GUIDE.md` §8 (near the Select and Dialog/popup bullets): a "Menu / context menu" bullet stating that all `Menu` / `MenuItem` dropdowns and right-click context menus are **dense by default via the theme**, that call sites must not set density themselves, and that `Select` option lists inherit the same density. (This doc edit is the "add design rule for this" deliverable; make it as part of implementation, not now.)
- Tests: the theme is exercised through rendered components. Add or extend a focused test that renders one representative menu (e.g. `mobile_create_menu` or the file-tree context menu) inside the app theme and asserts its `MenuItem`s carry the dense class (`MuiMenuItem-dense`), proving the theme default applies without a per-call-site prop. Do not snapshot every menu.

## acceptance criteria

- Every dropdown menu and right-click context menu in the app renders with MUI's dense layout (≈36px rows, tightened vertical padding) without any call site passing `dense` or `MenuListProps`.
- Density is defined once, in `createAppTheme` (`app/src/theme/app_theme.ts`); a menu added later with no density prop is dense automatically.
- `Select` dropdown option lists (branch, agent/model/thinking, card state, card type, config selects) are dense and visually consistent with the button and context menus.
- All prior menu behaviour is intact: correct anchoring and context-menu positioning, item icons, disabled states, destructive (error-coloured) items, dividers, and action-entry-point menu items.
- The top toolbar ribbon (`shell/menu/menu.tsx`) is unaffected — the change touches only dropdown/context menus.
- `design/STYLE_GUIDE.md` §8 documents the dense-menu rule and states density comes from the theme, not from call sites.
- A focused test proves at least one representative menu inherits the dense class from the theme default.
- `npm run typecheck` passes and the existing menu/component test suites stay green.