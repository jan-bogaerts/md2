---
author: 
id: F_69
internalId: e08c4b32-0bff-42a8-9df2-b0df009606ab
title: Config in dialog
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__e08c4b32-0bff-42a8-9df2-b0df009606ab.json#conversation=agent-57cd0e98-676d-4a2a-b564-5cf3a2d6f88a
  - design/activity/card__e08c4b32-0bff-42a8-9df2-b0df009606ab.json#conversation=agent-2825ce60-0b33-4a68-b014-3c74e7144f2b
policy:
after: 
---
# Goal

Show config in dialog instead of page. Keep ability to navigate with url when in browser

## Current state

- The toolbar `Config` button calls `navigateTo('/config')`, which sets `window.location.hash` to `#/config`.
- `MainWindow` treats `/config` as a full-page route and replaces `ProjectWorkspace` with `ConfigPage`. The status bar is hidden while config is open.
- `ConfigPage` owns the config draft lifecycle: it loads a draft on mount, discards it on unmount/cancel, saves React/project/desktop/Markdown changes, reports through `dialogService`, and navigates back to `/` after save or cancel.
- Config sections are selected through hash routes like `#/config/project` and `#/config/desktop`; `app_navigation.ts` maps those hashes to `{ pathname: '/config', hash: '#project' }`.
- Existing tests cover toolbar navigation, direct URL entry to `#/config/desktop`, draft behavior, save/cancel, project-config persistence, desktop bridge persistence, and responsive section tabs.

## implementation details

- Keep `ConfigPage` as the owner of config editing, draft state, validation, save/cancel behavior, and section rendering. Extract only if the dialog shell needs a distinct wrapper; do not duplicate config form logic.
- Change the toolbar entry point so it opens config as a dialog over the current workspace instead of replacing the workspace route.
- Preserve direct browser navigation: loading or navigating to `#/config` or `#/config/<section>` must still show the same config UI and select the requested section.
- Closing the dialog from the toolbar flow should return to the previous workspace state without resetting the open project, active view, search state, or menu state beyond closing the dialog itself.
- Saving should keep the current persistence behavior: project config writes through `dataService.projectLoading.saveProjectConfig()`, desktop config writes through `writeDesktopConfigToBridge()`, Markdown style changes use the theme settings path, and errors stay reported through `dialogService`.
- The dialog should follow the existing MUI dialog conventions from `design/STYLE_GUIDE.md`: title/header, scrollable body, footer actions aligned bottom-right, outlined `Cancel`, contained `Save`, and no nested card layout.
- Section links must remain URL-addressable. The dialog can update `#/config/<section>` while open, but route handling must avoid losing the underlying workspace context.

## acceptance criteria

- Clicking toolbar `Config` opens a modal dialog over the current workspace instead of replacing `ProjectWorkspace`.
- Direct navigation to `#/config`, `#/config/react`, `#/config/markdown`, `#/config/project`, or `#/config/desktop` opens config and selects the correct section.
- Save and cancel close config and restore normal workspace routing; unsaved config draft changes are discarded on cancel.
- Saving preserves all current side effects for React, project, desktop, and Markdown config, including project config persistence and Electron desktop bridge persistence.
- The current project, active workspace view, open files, search input, and card/list state are not reset by opening or closing config.
- Mobile and desktop layouts both render the config sections inside the dialog without clipped actions or inaccessible section navigation.
- Tests cover toolbar dialog open/close, direct URL open, section deep links, save/cancel routing, and preservation of workspace state behind the dialog.
