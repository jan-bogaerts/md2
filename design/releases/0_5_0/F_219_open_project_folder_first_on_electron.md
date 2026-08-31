---
author: 
id: F_219
internalId: 9500eb58-7f00-49e3-8961-0303cda178ab
title: open project folder first on electron
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__9500eb58-7f00-49e3-8961-0303cda178ab.json
policy:
after: 07585a70-9a56-42b6-a98c-a64de9d68995
---

when running on electron, select the 'folder' in stead of the the 'repository' by default.

## Current state

`ProjectOpenDialog` initializes its source as `personal`, so Repository is selected when the dialog first opens in both browser and Electron. Selecting Folder maps to `local` in Electron and `remote` in browser. An explicit `initialSource`, used by remote and recovery flows, can override this selection when the dialog opens.

Both `AppMenu` and `ProjectToolbarMenu` render the same dialog and pass `isDesktopMode` from `useProjectToolbarMenuActions`. No service, Electron bridge, persistence, or project-opening logic chooses the default.

## implementation details

- In `app/src/components/shell/project/project_open_dialog.tsx`, derive the default source from `isDesktopMode`: `local` in Electron and `personal` in browser.
- Apply that default whenever the ordinary Open Project dialog opens without an explicit `initialSource`. Keep an explicit source authoritative, and do not alter project-folder setup or missing-working-folder recovery screens.
- Keep existing mappings after user input: Folder means `local` in Electron and `remote` in browser; Repository means `personal` until user chooses Public.
- Update focused tests in `app/src/components/shell/project/project_dialogs.test.tsx`. No compatibility flag or new service state is needed because both verified call sites require the same mode-based behavior.

## acceptance criteria

- When ordinary Open Project dialog opens in Electron without an explicit source, Folder is selected and local-folder controls are visible.
- When ordinary Open Project dialog opens in browser without an explicit source, Repository remains selected and personal-repository controls are visible.
- An explicit initial source still overrides mode-based default, including remote connection flows.
- Closing and reopening ordinary dialog restores mode-based default after user selected another project kind.
- Project-folder setup and missing-working-folder recovery continue to hide project-kind selector and show only their existing resolution controls.
- Existing Repository/Folder switching, GitHub Personal/Public switching, local folder opening, and remote project opening keep current behavior.
