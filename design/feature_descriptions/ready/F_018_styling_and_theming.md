---
id: F-018
title: styling and theming
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Provide a global theme service (light/dark, flat look, configurable color scheme with preview, configurable markdown styles with pre-built defaults) that all components refresh from, including reading the theme in Electron before the main window is created.

## Current state
Theming is minimal ([[F-004]]): `createAppTheme(mode)` in `theme/appTheme.ts` just returns `createTheme({ palette: { mode } })`, and `useThemeMode` (`theme/useThemeMode.ts`) tracks light/dark, persisting the choice to `localStorage` (`md2.themeMode`) with an OS-preference fallback. `App` builds the theme and provides it via MUI `ThemeProvider`; `mode`/`onToggleTheme` are threaded as props through `MainWindow` and `MainToolbar` rather than read from a service. There is no configurable color scheme, no flat/round/borderless styling, no markdown style config, and `CardTypeConfig` (`data/dataTypes.ts`) has no color. On the desktop, `desktop/main.js` creates the `BrowserWindow` with default chrome and never reads the theme, so the window buttons are unstyled.

## implementation details
- Build the full theme from `createAppTheme(mode, colorScheme)`: apply the flat look (`elevation`/shadows off), round corners (theme-level `shape.borderRadius`), and no borders by default — buttons show a border on hover, inputs show only an underline that appears on hover/focus.
- Components stay color-mode agnostic: they read colors, spacing, fonts and radii from the theme only, never branching on light/dark.
- Configurable color scheme: expose editable `primary`/`secondary`/… roles each with `light`/`regular`/`dark` variants, feed them into the palette, and offer a live preview while editing.
- Configurable markdown styles: define a style config mapping each markdown section (title1, title2, caption, body, …) to font/color/size/formatting; ship pre-built defaults (`modern`, `classic`, `serif`, `sans-serif`, `handwritten`) selectable by the user.
- Persist color scheme and markdown-style selections alongside the theme mode in `localStorage` (matching `useThemeMode`); expose the whole theme (mode, scheme, markdown styles) through a single provider/hook so all components refresh on change.
- Electron: persist the theme mode with `electron-store` so the main process can read it in `desktop/main.js` before `createWindow()` (renderer `localStorage` is not accessible from main); style the native window controls accordingly (e.g. `nativeTheme.themeSource` and `titleBarOverlay` min/max/close colors), and keep the store in sync when the renderer changes the mode.
- Reference the vidsy project (`C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron`) for the global theme-service pattern.

## acceptance criteria
- All components obtain colors, spacing, fonts and radii from a single theme service and refresh when the theme changes, without knowing the color mode.
- Light and dark modes both render with the flat, round-cornered, borderless look; buttons show a border on hover and inputs show an underline on hover/focus.
- The color scheme (primary/secondary/… with light/regular/dark variants) is user-configurable with a live preview, and the choice persists across restarts.
- Markdown section styling is configurable, with the listed pre-built defaults selectable; the selection persists across restarts.
- On the desktop app, the theme mode is read before the main window is created and the native window buttons are styled to match.

## see also
- `design\architecture\initial description\style.md`
- `design\architecture\initial description\app layout.md`
