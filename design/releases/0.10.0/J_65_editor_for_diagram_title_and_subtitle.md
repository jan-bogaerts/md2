---
author: 
id: J_65
internalId: 73f5ddab-c096-401a-839f-f327d5415f86
title: editor for diagram title and subtitle
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__73f5ddab-c096-401a-839f-f327d5415f86.json
policy:
changedFiles:
  - app/src/components/diagram_view/surface/diagram_breadcrumb_bar.test.tsx
  - app/src/components/diagram_view/surface/diagram_breadcrumb_metadata_field.test.tsx
  - app/src/components/diagram_view/surface/diagram_breadcrumb_metadata_field.tsx
  - app/src/components/diagram_view/surface/diagram_current_subtitle.tsx
  - app/src/components/diagram_view/surface/diagram_root_menu_dropdown_button.tsx
after: e3024124-3c82-4b0d-9af0-e50cb93cf995
---

We currently show the title and subtitle on the diagram in the upper left corner, both in edit as in view mode I believe (if so, both need to be fixed). These 2 should be removed, and instead, the sub title should be shown in the bar where the breadcrumbs are, just below the breadcrumbs. The title is already shown as the last item in the breadcrumbs list.\
There should be only 1 subtitle, and it should contain the sub title of the currently visible diagram.

When in edit mode, the breadcrumb that contains the title of the currently visible diagram (last breadcrumb in the list) should be editable. The sub title should also be editable.

## Current state

**Subtitle** means `DiagramData.meta.description`; no separate subtitle field exists.

`DiagramView` renders `DiagramBreadcrumbBar` as an overlay above the active diagram. The bar shows the active path from `DiagramViewService.index.activePath`. The first breadcrumb opens the saved-root menu, intermediate breadcrumbs navigate, and the last breadcrumb is disabled. During an edit session, the matching breadcrumb already shows the draft `meta.title`, but it remains a button and the bar shows no subtitle.

Title and subtitle are also rendered inside diagram content:

* `rendering/diagram.tsx` shows saved `meta.title` and `meta.description` in a sticky header above Current.
* `editing/editable_diagram.tsx` shows `DiagramInlineMetadataField` inputs in a sticky header above New.

`DiagramInlineMetadataField` trims and commits title or description through `DiagramEditSessionService.objects.setMetadataField` on blur or its keyboard commit command. Empty values are rejected. Field-scoped events update only subscribers to that metadata field, and `DiagramSaveService` persists the complete edited diagram copy. `DiagramZoomViewport` currently measures the editable header when calculating its minimum drawing area, while viewport padding reserves space for the breadcrumb overlay.

## Implementation details

* Make `DiagramBreadcrumbBar` own title/subtitle presentation for every diagram mode. Keep one navigation row and render exactly one subtitle below it. In view mode, read subtitle from the active Current diagram. In edit or creation mode, read title and subtitle from the active edit session so unsaved changes appear immediately.
* Keep previous breadcrumbs as navigation controls. Replace only the final breadcrumb with a title editor when its record is the edit session's `sourceDiagramId`; never make an ancestor breadcrumb editable.
* Add a breadcrumb metadata editor component beside `diagram_breadcrumb_bar.tsx`. It owns draft text, validation, blur/keyboard commit, and Escape reset, but writes model data only through `session.objects.setMetadataField`. Preserve current trimming, required-value validation, and description keyboard behavior. Do not apply diagram `fontScalePercent`: breadcrumb bar is application chrome, not diagram content.
* When the editable final breadcrumb is also the root breadcrumb, show an `ArrowDropDownOutlined` button as the title field's end adornment, like a combo box. The title area edits text; only the dropdown icon opens the saved-root menu. Give the icon a tooltip, `aria-label="Open root diagrams"`, `aria-haspopup="menu"`, and `aria-expanded`. Child-diagram editing keeps the existing root breadcrumb menu button.
* Remove title/subtitle markup from `rendering/diagram.tsx` and remove the editable metadata header plus its wrapper exports from `editing/editable_diagram.tsx`. `DiagramInlineMetadataField` has only those two production call sites today; move its behavior to the breadcrumb editor and remove the old component rather than keeping a second rendering path.
* Reserve the two-row breadcrumb bar height at the `DiagramView` content boundary so Current, New, and every comparison layout start below it. Remove obsolete title-header gaps and viewport-specific top compensation.
* Update `DiagramZoomViewport` minimum-size calculation so it no longer queries or observes `New diagram editor header`. Continue observing the scroller and drawing surface inputs needed to grow empty or small diagrams without changing diagram data.
* Keep `DiagramEditSessionService`, field-scoped metadata events, change tracking, save serialization, and diagram record identity unchanged. This feature relocates existing metadata editing; it does not add model fields or a second source of truth.
* Update component tests: breadcrumb tests cover view and edit values, immediate draft updates, ancestor navigation, root dropdown behavior, validation, and switching active diagrams; Current and New viewport tests assert no metadata header remains and drawing content clears the two-row bar; editable-diagram tests retain metadata mutation coverage through the new breadcrumb editor.

## Acceptance criteria

1. In view mode, title appears only as the final breadcrumb and exactly one subtitle appears directly below the breadcrumb row, using the active diagram's `meta.description`.
2. No title or subtitle is rendered inside Current or New diagram content, including horizontal, vertical, and tabbed comparison modes.
3. In edit or creation mode, only the final breadcrumb title and the single subtitle are editable. Ancestor breadcrumbs keep their navigation behavior.
4. Title and subtitle edits trim and update their existing metadata fields, appear in the bar before persistence, participate in existing dirty/change tracking, and persist through the existing save flow.
5. Blank title or subtitle input shows validation and does not replace the stored value. Escape restores the stored value without committing the draft.
6. While editing a root diagram, a dropdown icon inside the title control opens the saved-root menu without changing or committing title text. The title control remains independently editable.
7. Navigating to another diagram replaces both final breadcrumb title and subtitle with that diagram's values; no previous subtitle remains visible.
8. Breadcrumb bar does not cover diagram content at supported zoom levels or in any comparison layout. Removing old metadata headers does not change diagram model geometry or saved coordinates.
