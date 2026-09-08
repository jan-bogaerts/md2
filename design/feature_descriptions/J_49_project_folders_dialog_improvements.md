---
author: 
id: J_49
internalId: b1dd875a-96b4-41c1-8e3c-7a1ce548877d
title: project folders dialog improvements
status: ready
owner: 
affects:
agents:
  - design/activity/card__b1dd875a-96b4-41c1-8e3c-7a1ce548877d.json
policy:
changedFiles:
  - app/src/components/shell/project/project_folder_setup_fields.tsx
---
* clicking outside of the dialog should not close it. to cancel, user needs to explicitly click on cancel
* We need to improve the style of the dialog: currently, the folder is not really easy to overview, its just a list of texts.

make a proposal on how we can improve the dialog & content style and such. check other dialogs and so. also check [STYLE\_GUIDE.md](design/STYLE_GUIDE.md)

perhaps we can give some structure:

* design at top
* active, diagrams, actions are at the same level
* history, archived

See image:

<img height="349" width="312" alt="Screenshot 2026-09-08 170205.jpg" src="file:///C:/Users/janbo/Pictures/temp/Screenshot%202026-09-08%20170205.jpg" />

## Current state

`ProjectOpenDialog` (`app/src/components/shell/project/project_open_dialog.tsx`) is one MUI `Dialog` that renders two different steps. The **source step** picks Repository / Folder / GitHub / remote. The **folder-setup step** appears instead when `projectOpenResolution.kind === 'project-folder-setup'` and the storage type is not `github-readonly`; it is titled `Project folders` and renders `ProjectFolderSetupFields`.

Dismissal today: the dialog passes `onClose={handleClose}` with no `reason` inspection, so MUI calls it for both `escapeKeyDown` and `backdropClick`. A **backdrop click** — a click on the dimmed scrim outside the dialog paper — therefore throws away every folder value the user typed, in both steps.

Content today: `ProjectFolderSetupFields` renders one flat `Stack spacing={2}` of six equal `Autocomplete` + `TextField` rows, driven by the `FOLDER_FIELDS` array (project, working, archived, actions, releases, diagrams). Each row uses a floating MUI `label` plus a full-sentence `helperText`, and appends `Will be created.` to that sentence when the resolved path is absent from `resolution.existingFolderPaths`. Consequences: nothing shows that the five sub-folders live *inside* the project folder; the "will be created" state is buried in prose rather than carried by a visible marker; the floating labels contradict `STYLE_GUIDE.md` §6, which requires a plain 12px/600 `text.secondary` label placed above the control; and the rows read as an undifferentiated wall of text, which is the complaint in the screenshot.

Resolved paths come from `resolvedSetupFolders` in `app/src/services/project/project_session_service.ts`; validation comes from `requireProjectFolderValues`. Neither changes here.

## implementation details

* Block backdrop dismissal **only while the folder-setup step is showing**. Give `ProjectOpenDialog` an `onClose(event, reason)` handler that returns early when `projectFolderSetup !== null && reason === 'backdropClick'`. Escape (`escapeKeyDown`) keeps closing, and Cancel keeps closing, in both steps. The source step keeps today's close-on-backdrop behaviour, because nothing typed there is lost work of the same weight.
* Because `DialogActions` Cancel is now the only pointer-driven exit from the folder-setup step, keep it visible and enabled at all times, including while `isLoading`.
* Restructure `ProjectFolderSetupFields` into a **root + two labelled groups** hierarchy that mirrors the on-disk nesting:
  * Root row: `Project folder` (e.g. `design`), rendered as the parent, visually distinct (heavier weight, own row, no indent).
  * Indented under it, group **Live** (`custom.colHead` overline header per `STYLE_GUIDE.md` §6): `Working folder` (active), `Diagrams folder`, `Actions folder`.
  * Indented under it, group **History** (same overline treatment): `Releases folder` (history), `Archived folder`.
  * Indentation is a single left inset plus a 1px `divider` guide rail on the group container, so the parent/child relation is readable without a real tree widget. Do not add a `TreeView`; the depth is fixed at one level.
* Rewrite each row to the `STYLE_GUIDE.md` field pattern: plain `Typography` label above the control (12px/600, `text.secondary`), the `Autocomplete`/`TextField` below it, `FolderOpen` browse `IconButton` as end adornment with tooltip and `aria-label` (desktop only, i.e. when `onBrowseProjectSubFolder` is non-null — unchanged). Remove the floating MUI labels.
* Replace the per-row helper sentence with two lighter signals: the **resolved repository path** as `custom.text3` meta under the control, and a status marker on the row — a `Will be created` count-style chip (`background.paper`, 1px `divider`, `custom.text3`) when the resolved path is missing from `existingFolderPaths`, and nothing when the folder already exists. Keep one short explanatory sentence at the top of the panel, as today, covering both the `hasProjectConfig` and the fresh-project wording.
* Keep the descriptor-driven structure: extend `FOLDER_FIELDS` with a `group` discriminator (`'root' | 'live' | 'history'`) and render by grouping over it, rather than hand-writing six rows. Field order inside a group follows the sketch.
* Every colour, radius and spacing value comes from the theme (`STYLE_GUIDE.md` §1). No raw hex, no raw px colours. Verify light and dark mode.
* No change to `ProjectFolderValues`, `resolvedSetupFolders`, `requireProjectFolderValues`, browse wiring, or the confirm path. This feature is dismissal behaviour plus presentation.
* Record the new dismissal rule in `design/STYLE_GUIDE.md` §8, which currently says dialogs "close on `Esc`/backdrop": state that a dialog holding unsaved multi-field input may refuse `backdropClick` while `Esc` and Cancel still close.
* Tests, extending `app/src/components/shell/project/project_dialogs.test.tsx`: backdrop click during folder setup keeps the dialog open and preserves typed values; backdrop click on the source step still closes; Escape closes during folder setup; Cancel closes; the six fields render under the expected group headers in the expected order; a missing folder shows the created marker and an existing one does not; browse buttons remain desktop-only.

## acceptance criteria

* Clicking the scrim outside the dialog while the `Project folders` step is showing leaves the dialog open with every typed folder value intact.
* Escape and the Cancel button both still close the dialog from the `Project folders` step.
* Clicking the scrim on the source-picker step still closes the dialog, as before.
* Cancel stays visible and clickable on the `Project folders` step, including while loading.
* The `Project folders` step shows `Project folder` as a single parent row, with the five sub-folders indented beneath it under the `Live` (working, diagrams, actions) and `History` (releases, archived) headers, in that order.
* Each folder row shows a plain label above its input, its resolved repository path as meta text, and a `Will be created` marker only when that resolved path does not exist on disk.
* No floating MUI input labels and no per-row helper sentences remain in `ProjectFolderSetupFields`.
* The dialog contains no hardcoded hex or raw px colour values, and renders correctly in dark mode.
* Folder editing, folder browsing, validation errors, and the confirm/open action behave exactly as before.
* `design/STYLE_GUIDE.md` §8 documents the conditional backdrop-dismissal rule.
* `project_dialogs.test.tsx` passes, `npm run typecheck` passes, and lint passes.
