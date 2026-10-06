---
id: B_259
internalId: e461b100-4b8f-435e-9c0f-81426d7fdb47
title: Responsive search reopens after Escape and loses results on resize
status: new
---

Reported during review of [PR #27](https://github.com/jan-bogaerts/md2/pull/27), head `e1181650a`. Fix after the PR is merged.

## Search reopens after Escape

1. Use a window width where search shows the shortcut presentation.
2. Open search by clicking its launcher.
3. Press Escape.

The popover closes and immediately reopens. Closing should dismiss search and leave keyboard navigation usable.

`SearchControl` uses a MUI `Popover` that restores focus to the launcher on close. `SearchLauncher` opens search through its `onFocus` handler, so restored focus opens it again. A targeted regression probe reproduced the failure; disabling focus restoration in a temporary probe prevented reopening.

Affected files: `app/src/components/shell/search/search_control.tsx` and `search_launcher.tsx`.

## Resizing clears results and search options

1. Open inline search and enter a query that returns a result, such as `Beta` in the existing test fixture.
2. Resize until search changes to a popover presentation.

The query remains, but the matching results disappear. RegExp mode and the background-body/action options also reset. Resizing should preserve the active search, its options, and matching results in either direction.

`SearchControl` mounts `SearchPanel` in separate inline and popover branches. Changing presentation remounts the panel. Only the query survives in `SearchControl`; `SearchPanel` initializes empty results and default options and does not apply its initial query on mount.

Affected files: `app/src/components/shell/search/search_control.tsx` and `search_panel.tsx`.

## Regression coverage

- Open shortcut search, press Escape, and verify it stays closed without preventing later reopening.
- Search for a matching card and resize between inline and popover presentations; verify the query and result remain available.
- Enable RegExp mode and background-body/action options before resizing; verify their selections and search behavior survive.

Both reported failures were reproduced with temporary probes in `search_control.test.tsx`; the probes were removed after review. No fix is included in this report.
