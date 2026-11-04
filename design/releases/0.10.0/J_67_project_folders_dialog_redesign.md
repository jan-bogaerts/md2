---
author: 
id: J_67
internalId: ad646cb9-3521-4a35-ae1b-7fdaa2701547
title: project folders dialog redesign
status: ready
owner: 
affects:
agents:
  - design/releases/0.10.0/card__ad646cb9-3521-4a35-ae1b-7fdaa2701547.json
policy:
after: 45aee390-2708-4b8b-b215-2f7ecabcabe4
changedFiles:
  - app/src/components/shell/project/project_folder_setup_fields.tsx
  - app/src/components/shell/project/project_open_dialog.test.tsx
---
see:

<img height="472" width="410" alt="pasted image" src="pasted-image-1c4cf12a-2a6c-4e32-b42b-134214d25ad3.png" />

it does not look good, it has a poor overview: no cards are used to group things nicely together (see [config_subsection.tsx](app/src/components/config/config_subsection.tsx)). It is very hard to see that we are dealing with 'inputs' and what belongs with what. also, I think there is a helper text, but with 1 or 2 words, that's meaningless. we need to provide proper sentences with a proper explanation what the folder is for, what it contains. Finally, has the 'TextField' component been used for these inputs or was this some home made thing? please make certain we use the correct components here.

## Current state

`ProjectOpenDialog` renders `ProjectFolderSetupFields` when opening a writable project requires folder setup. `ProjectFolderSetupFields` owns no domain state: it receives the current `ProjectFolderValues`, reports edits through `onValuesChange`, and leaves validation, folder creation, config persistence, and project opening to `project_open_flow_service.ts` and `project_session_service.ts`.

The six rows are generated from `FOLDER_FIELDS`. `Project folder` is shown first; `Working folder`, `Diagrams folder`, and `Actions folder` sit under a **Live** heading; `Releases folder` and `Archived folder` sit under **History**. The groups use only an overline heading, indentation, and a vertical rule. They therefore read as one long form instead of distinct related sections.

Each editable control is an MUI `Autocomplete` whose `renderInput` returns an MUI `TextField`; it is not a homemade input. However, the field does not set a variant, so the app-wide `MuiTextField` default of `variant: 'standard'` gives it only an underline. The visible label and the text below the control are separate `Typography` elements. That lower text is the resolved repository path, such as `design/active`, not helper text, but its placement makes it look like an unexplained one- or two-word helper. A `Will be created` marker appears beside the path when the folder is absent.

## implementation details

* Change only presentation in `project_folder_setup_fields.tsx`. Keep `ProjectFolderValues`, validation, browse behavior, resolved paths, missing-folder detection, confirmation, and persistence unchanged.
* Reuse `ConfigSubsection` for three outlined cards. **Project folder** contains the root field. **Current project files** contains Working, Diagrams, and Actions, in that order. **History** contains Releases and Archived, in that order. Remove the **Live**/**History** guide-rail layout; cards now carry grouping and hierarchy.
* Give each card a full-sentence description:
  * Project folder: `Choose the top-level repository folder that contains this MD² project.`
  * Current project files: `These folders contain files MD² reads or writes while work on the project is active.`
  * History: `These folders contain completed releases and cards archived outside a release.`
* Add a `description` to every folder descriptor and pass it to the field's MUI `TextField` as real helper text:
  * Project folder: `Contains the MD² project configuration and all project subfolders.`
  * Working folder: `Contains active design and job Markdown files that MD² loads as cards.`
  * Diagrams folder: `Contains JSON diagram data saved by diagram actions.`
  * Actions folder: `Contains JSON definitions for project actions.`
  * Releases folder: `Contains one subfolder for each completed release.`
  * Archived folder: `Contains cards archived individually outside a release.`
* Keep `Autocomplete` because it supplies existing-folder suggestions and free text. Its `renderInput` must use MUI `TextField` with `variant="outlined"`, `size="small"`, and `fullWidth`, while retaining the browse adornment, tooltip, accessible name, disabled state, and Autocomplete parameters.
* Keep the resolved repository path below each field as separate meta text, explicitly prefixed with `Resolved path:`. Keep `Will be created` beside it only when that resolved path is absent. This separates explanation, value, resolved location, and creation state.
* Keep descriptor-driven rendering. Do not duplicate six field blocks or add a service, compatibility mode, or new state owner.
* Extend `project_open_dialog.test.tsx` to verify card headings and field order, exact helper descriptions, outlined MUI inputs, resolved-path labels, missing-folder markers, editing, and browsing. Existing validation and confirmation tests remain valid.

## acceptance criteria

* Dialog shows three distinct outlined cards named **Project folder**, **Current project files**, and **History**.
* Project folder card contains only Project folder. Current project files contains Working, Diagrams, and Actions in that order. History contains Releases and Archived in that order.
* Every card and every folder field displays the full explanatory sentence defined above.
* Every editable folder control is an MUI `TextField` rendered by `Autocomplete` with the outlined variant; controls visibly read as inputs in light and dark themes.
* Every row shows `Resolved path: <path>`. `Will be created` appears only when that resolved path does not exist.
* Existing-folder suggestions, free-text editing, folder browsing, disabled state, validation errors, Cancel, and Open behavior remain unchanged.
* No new domain state or persistence behavior is introduced.
* Relevant `project_open_dialog.test.tsx` tests and app lint pass.
