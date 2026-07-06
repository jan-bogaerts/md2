---
id: F-028
title: markdown style rendering
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Actually apply the configurable markdown styles (F-018) to the editing/reading surfaces: the selected preset (modern, classic, serif, sans-serif, handwritten) must visibly change how markdown sections (title1, title2, title3, body, caption) render in the MDXEditor card body and text view.

## Current state
The style model, presets and persistence are done: `theme_config.ts` defines `MarkdownStyleConfig` and the five presets, `useThemeSettings` persists the selection, and `AppThemeProvider` exposes `markdownStyleConfig` through `useAppTheme`. But **no rendering surface consumes it** — the only references outside the provider are tests. Selecting a different preset in `ThemeSettingsDialog` changes nothing visually. `MarkdownEditor` (`app/src/components/editor/markdown_editor.tsx`) renders with MDXEditor's default styles.

## implementation details
- In `MarkdownEditor`, read `markdownStyleConfig` via `useAppTheme` and map each section to CSS applied to the editor's content area (`.mdxeditor-content`): `title1/2/3` → `h1/h2/h3`, `body` → paragraphs/lists, `caption` → blockquote/small text. Apply `fontFamily`, `fontSize`, `color` (respect `inherit`) and the bold/italic formatting flags.
- Generate the styles through the theme (sx/styled on the wrapping Box), not global CSS, so components stay theme-driven and refresh on change (per architectural decision "components use the app theme service path").
- Keep MDXEditor toolbar/chrome unaffected; only the content typography changes.
- Extend the theme settings dialog's markdown preview to render a sample using the same mapping so the preview matches reality.
- Fonts: presets reference system-safe font stacks already; no webfont loading in this feature.

## acceptance criteria
- Switching the markdown style preset immediately changes heading/body/caption rendering in the card body editor and text view editor.
- The selection persists across restarts and applies on load (already persisted; now visible).
- Light and dark modes both render correctly with each preset (colors default to `inherit`).
- The theme dialog preview matches the actual editor rendering.
- Tests assert that the section-to-CSS mapping is applied for a given preset and that changing the preset updates the editor styles.

## see also
- `design\feature_descriptions\F_018_styling_and_theming.md`
- `design\architecture\initial description\style.md`
