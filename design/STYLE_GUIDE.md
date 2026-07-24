---
internalId: f2ec9e28-8064-4707-bce9-b62f24d57524
---

# App Style Guide — Kanban / MD² (React + MUI)

How to build **any new component** so it matches the app. This is written for **Material UI v5+** components.

**The theme is the source of truth.** All color, radius, base typography, and spacing units live in the single `createTheme` (defined in `GUIDANCE.md` §1/§9). This guide does **not** define colors — it tells you **which theme value to use for which role**, and covers the things the theme can't encode: layout, spacing/margins, borders, elevation, and component conventions.

**The one rule that matters:** never write a raw hex, px radius, or magic color into a component. Read it from the theme (`theme.palette.*`, `theme.shape`, `theme.typography`, `theme.spacing`). If a component has a hardcoded hex in its `sx`/styled, it's wrong — that's exactly where the look drifts and where dark mode breaks.

---

## 1. How to consume the theme

- **Colors:** `sx={{ color: 'text.secondary', bgcolor: 'background.paper', borderColor: 'divider' }}` — MUI resolves dotted palette paths automatically in `sx`. In `styled`/JS use the callback form: `styled(Box)(({ theme }) => ({ color: theme.palette.text.secondary }))`.
- **Spacing:** use the 8px unit via the spacing scale — `sx={{ p: 2, gap: 1, mt: 1.5 }}` (`2` = 16px, `1` = 8px). Don't write `padding: '16px'`.
- **Radius:** `borderRadius: 1` (= `theme.shape.borderRadius` = 8) and multiples; for the fixed non-8 radii see §4.
- **Typography:** prefer `Typography variant=...` and `theme.typography.*` over ad-hoc `fontSize`.
- **Custom tokens:** roles the default MUI palette doesn't cover (column/track surfaces, the strong/hover border steps, `text-3/4`, section-header color, `primary-bg` tint, status colors) must exist in the theme under a namespace (e.g. `theme.palette.custom.*`) with light + dark values. Consume them the same way — `bgcolor: 'custom.column'`. **Never inline their hex.** If a needed token doesn't exist yet, add it to the theme, don't hardcode it in the component.

---

## 2. Role → theme slot

Pick the slot by the element's **role**, not by how it looks in one mode:

| Role | Theme slot |
|---|---|
| App background; tinted footer/action bars | `background.default` |
| Column & sidebar surface | `custom.column` |
| Segmented-control / toolbar track, hover fill | `custom.track` |
| Card, dialog, popup, input surface | `background.paper` |
| Hairlines, resting borders | `divider` |
| Input borders, vertical separators | `custom.borderStrong` |
| Border on hover | `custom.borderHover` |
| Titles, values, headings | `text.primary` |
| Body copy, field labels | `text.secondary` |
| Meta, captions, resting icons | `custom.text3` |
| Muted / placeholder / disabled | `custom.text4` |
| Uppercase section/column headers | `custom.colHead` |
| The one CTA, selection, focus, links, icon-hover | `primary.main` |
| Contained-button hover | `primary.dark` |
| Selected/tinted bg, focus ring, ID-chip bg | `custom.primaryBg` |
| Text/icon on a primary fill | `primary.contrastText` |
| Active / saved / online dot | `success.main` |
| Destructive action | `error.main` |
| Status swatch dots & ID-chip tints (decorative only) | `custom.status.*` |

Rules: **one** `primary` per surface (the CTA/selection accent) — everything else is `text-*`/`divider`. Status colors are **decoration only** (dots, chip tints), never interactive color. Dark-mode brightness/tinting is handled inside the theme's two palettes, so a correctly-sloted component needs zero per-mode code.

---

## 3. Layout

- **Full-height app:** column flex — menu row / ribbon / content (`flex: 1; minHeight: 0`) / status bar. Fixed bands `flexShrink: 0`.
- **Board:** horizontal-scroll flex row, `gap: 2` (16px), page padding `p: 2.5` (20px); columns `width: 296, flexShrink: 0`, internal column flex `gap: 1`.
- **List view:** two-pane flex row filling the space between ribbon and status bar — sidebar `width: 280, flexShrink: 0`, editor pane `flex: 1, minWidth: 0` (the `minWidth: 0` is required so long content ellipsizes instead of blowing out the row).
- **Panels (sidebar, editor card, dialogs):** column flex with stacked bands (header / [toolbar] / body / footer). The **body scrolls** (`overflow-y: auto; minHeight: 0`); header and footer are `flexShrink: 0` and never scroll away.
- **Spacer pattern:** push trailing items with `<Box sx={{ flex: 1 }} />` rather than `margin-left: auto` sprinkled around, so rows stay predictable.
- Use flex `gap` for spacing between siblings — don't hand-space with per-child margins.

---

## 4. Spacing, margin & size conventions

- **4/8px grid, via `theme.spacing`.** page padding `2.5`; between columns `2`; inside columns / between related controls `1`; dialog body gap `2–2.25`; field label→control gap `~0.9` (7px).
- **Margins:** prefer padding on containers + flex `gap` over element margins. Where a floating panel needs breathing room (e.g. editor card, toolbar inside a panel), use container padding (`p: 2 / 2.5`), not margins on the children.
- **Fixed heights (px):** menu row 44, ribbon 52, status bar 32, section header 40, tab row 40, standard button / control 34, dense icon button 26–28, input 42.
- **Fixed widths (px):** column 296, sidebar 280, search 260, standard dialog 480, wide/editor dialog 760.
- **Radius family (px):** buttons/icon-buttons 8 (small 6–7), inputs 9, cards 10, columns/panels 12, dialogs/popups 14, chips/pills 99, color swatches 3. `borderRadius: 1` covers the 8 case; use explicit `'9px'` etc. for the others.

---

## 5. Borders & elevation

- **Rest = border, not shadow.** Resting surfaces: `border: '1px solid'`, `borderColor: 'divider'`. Inputs use `custom.borderStrong`. **Shadow only when floating or lifted** (hover, drag, dialogs/popovers).
- **Separation between bands:** a single 1px `divider` hairline. Don't stack a heavy rule *and* an outline — one line, let background contrast do the rest. Vertical separators inside toolbars: a 20px-tall `custom.borderStrong` rule.
- **Elevation ladder (only where floating):** card hover `0 4px 12px rgba(16,24,40,0.12)`; dragging MUI `elevation 8` + `rotate(2deg)`; contained button `0 1px 2px rgba(16,24,40,0.15)`; dialog/popup `0 24px 60px rgba(16,24,40,0.28)`; scrim `rgba(16,24,40,0.45)` + `backdropFilter: blur(2px)`.
- Set `MuiPaper.elevation: 0` and `MuiButton.disableElevation` globally in the theme; add the shadows above explicitly where the ladder calls for it.
- **On dark backgrounds shadows read as nothing** — the theme already handles this by making hover raise `borderColor` (`custom.borderHover`) instead of relying on shadow.

---

## 6. Typography usage

Drive everything from theme variants / `theme.typography`; avoid ad-hoc `fontSize`.

- Titles/values/headings → `text.primary`; body & labels → `text.secondary`; meta → `custom.text3`.
- **Field labels:** a plain `Typography` (12px/600, `text.secondary`) placed **above** the control — **never** MUI floating/outlined `TextField` labels (they clash with the app's flat-label style).
- **Section/column headers:** `Typography variant="overline"` (uppercase, `letterSpacing ~0.7px`, `fontWeight 700`, `custom.colHead`).
- **ID chips only** use monospace; everything else is the theme's default family.
- `button.textTransform: 'none'` and `button.fontWeight: 600` are set in the theme — don't re-uppercase buttons.

---

## 7. Interaction states

Consistent across all components; all colors from the theme:

- **Ghost icon button** (`IconButton`): transparent → hover `bgcolor: track` (or `background.paper` on a colored panel) + `color: primary.main`. Override MUI's default circular hover tint via `sx`.
- **Outlined button:** `divider` border, `text.secondary` → hover `borderColor/color: primary.main`. Destructive: hover `borderColor: error.main` + `bgcolor: custom.dangerBg`.
- **Contained (primary) CTA:** `primary.main` + small shadow → hover `primary.dark`.
- **Input/field focus:** `borderColor: primary.main` + `boxShadow: 0 0 0 3px` in `custom.primaryBg` (the soft halo). Unfocused hover: `borderColor: custom.borderHover`.
- **List/tree row:** hover `bgcolor: track`; selected `bgcolor: custom.primaryBg` + title `text.primary`.
- **Row-level actions** (delete, ⋮): hidden at rest, shown on `:hover`/`:focus-within` via **opacity** (keep in DOM so width doesn't jump).
- **Active tab/menu item:** 2px `primary.main` bottom border + `primary.main` text.
- Every icon-only control gets a `Tooltip` (theme sets `arrow: true`) **and** an `aria-label`.

---

## 8. Component conventions (MUI primitives)

- **Buttons:** `Button variant="contained"` = the single CTA per surface; `variant="outlined"` = secondary; `variant="text"` = tertiary. Icon-only → `IconButton` in a `Tooltip`. Don't use `Link` or text `Button` where an action button belongs (that reproduces the old text-link look).
- **Icons:** `@mui/icons-material` **Outlined** variants; `fontSize: 18` in 34px buttons, `16` in dense, `13–15` inline. Don't hand-draw SVG.
- **ID chip:** monospace, accent text on `custom.primaryBg`/status tint, `radius 5, flexShrink: 0`.
- **Count chip:** `background.paper` bg, 1px `divider`, radius 9–10, `custom.text3`.
- **State dot:** 7–8px circle + `text-3` label; green (`success.main`) = active/saved/online.
- **Search:** pill `TextField` (`borderRadius: 99`, `bgcolor: background.default`), search start-adornment, `⌘K` keycap end-adornment.
- **Select:** `size="small"`, optional dot+name via `renderValue`; 42px / radius-9 frame. When a select has a tooltip, keep the tooltip available while the select is closed and explicitly hide it for the entire time the select menu is open so it cannot cover the first option.
- **Segmented control** (view switch, formatting toolbar): `ToggleButtonGroup` on a `custom.track` background; selected segment `background.paper` + `0 1px 2px` shadow + `primary` text.
- **Dialog / popup:** `Dialog`/`Popover` with `PaperProps` → `background.paper`, 1px `divider`, radius 14, big shadow; scrim via `slotProps.backdrop` (blur + tint). Bands separated by hairlines; footer on a `background.default` bar with top hairline; actions right-aligned (outlined Cancel + contained CTA). `autoFocus` first field; submit on `Enter` (`⌘/Ctrl+Enter` in a textarea); close on `Esc`/backdrop.
- **Empty state:** dashed target — `1.5px dashed custom.borderStrong`, radius 10, centered icon + `custom.text4` label. No "click to add" placeholder blocks.

---

## 9. Definition of done for a new component

1. Zero hardcoded hex / raw px colors — every value comes from `theme.palette` / `theme.shape` / `theme.spacing` / `theme.typography`.
2. Correct role→slot mapping (§2); at most one `primary` CTA on the surface.
3. Borders at rest, shadow only when floating (§5); bands split by a single hairline.
4. Hover **and** focus states on every interactive element (§7); icon buttons have tooltip + `aria-label`.
5. Body scrolls, header/footer pinned; `minWidth: 0` on flex children that hold long text.
6. Toggle to dark mode and confirm nothing breaks — if it does, you hardcoded a color somewhere (§1).

Component-specific detail lives in `GUIDANCE.md` (theme definition + board/list/dialog), `CARD_POPUP_GUIDE.md`, `RUN_DIALOG_GUIDE.md`, and `SIDEBAR_ACTIONS_GUIDE.md`.
