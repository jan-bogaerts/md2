---
author: 
id: F_370
internalId: 1e7b5718-e065-479d-9d50-be0ff38d738f
title: config dialog project tab improvements
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__1e7b5718-e065-479d-9d50-be0ff38d738f.json
policy:
---
we need to improve the layout of the project tab on the config dialog:

* the first section is a list of input from project-folder to archive folder. these should be grouped together, title 'folders' with a short explanation with this is about.
* diagram footer should be moved down to the end
* all git related configs should be grouped, title 'git' with explanation (so diff command, push mode)
* card related configs should be grouped: card separator, card types, columns
* for card types, instead of editing a row array, lets create a custom component, that allows the user to add, delete the types, show the color as background of the button that represents the type. when clicked, user can edit details. use color picker to set the color, inputs for the others.
* similar for columns: create a custom component with buttons

## Current state

`ProjectConfigSection` in `app/src/components/config/project_config_section.tsx` filters `entries` down to `entry.section === 'project'` and hands the whole list to `ConfigSectionLayout`, which renders one `Typography variant="h6"` heading ("Project") and then a flat `Stack spacing={3}` of `ConfigValueEditor` elements, one per entry, in `CONFIG_ENTRIES` declaration order. There is no grouping construct and no per-group explanation anywhere in the config page today. `WorktreeConfigList` is appended after the flat stack when `worktreeService.isSupported()` and the section is not disabled.

The declaration order in `app/src/services/config/config_entries.ts` is therefore the on-screen order: Project folder, Working folder, Actions folder, Releases folder, Diagrams folder, Archived folder, Background shade, Diff command, Diagram footer, Push mode, Card separator, Card types, Columns. `project.pinnedConversations` is also in the project section but carries `editable: false`; it is not part of this feature. So the diagram footer, a six-row multiline text field, currently sits in the middle of the tab between the diff command and the push mode, which is what makes the tab hard to scan.

`project.cardTypes` and `project.states` both have `type: 'json'`, so `ConfigValueEditor` renders each one as a monospace multiline `TextField` (their keys are in `MONOSPACE_CONFIG_KEYS`) that holds the raw JSON array text in local `jsonText` state, calls `JSON.parse` on blur, and passes the parsed value to `onChange`. A `JSON.parse` failure on blur throws out of the handler; there is no inline validation. `configService.validateValue` then runs `validateCardTypes` or `validateStates` on the parsed value when the draft is committed.

A card type is `{ color, idPrefix, label, type }`, where `type` is the free-form string stored on each card. A column is `{ alwaysVisible, color?, defaultActionId?, state }`; `validateStates` fills a missing colour with `defaultColumnAccent(index)` and rejects duplicate `state` values. Array order is the board column order.

Two precedents already exist for replacing a JSON blob with a real editor. `AgentProfilesEditor` in `app/src/components/config/agent_profiles_editor.tsx` is wired in through an `entry.key === 'desktop.agentProfiles'` branch in `ConfigValueEditor`: it renders a list of rows plus an inline add/edit form, computes its own error list, and reports it upward through `onValidityChange`, which `ConfigPage` collects into `invalidConfigKeys` to gate the Save button. `ThemeSettingsDialog` in `app/src/components/shell/theme_settings_dialog.tsx` already picks colours with a plain MUI `TextField type="color"`; no colour-picker package is installed and none is needed.

Existing tests that touch this area: `config_page.test.tsx` asserts the background shade options, the card separator warning and rename flow, and edits project columns through `screen.getByRole('textbox', { name: 'Columns' })` — that last one targets the JSON textarea this feature removes.

## implementation details

* Add a grouping wrapper `ConfigSubsection` in `app/src/components/config/config_subsection.tsx`: a `Box` with `component="section"`, an `aria-labelledby` heading (`Typography component="h4" variant="subtitle1"`), a `Typography color="text.secondary" variant="body2"` explanation line, and its children in a `Stack spacing={3}`. It takes `children`, `description`, `id` and `label`, so it stays free of config knowledge and can be reused by other sections later.
* Rewrite `ProjectConfigSection` to place entries into named groups instead of handing the whole list to `ConfigSectionLayout`. Keep the existing `Typography variant="h6"` "Project" heading and the `id="project"` anchor that `ConfigPage` scrolls to, then render, in this order:
  * **Folders** — `project.projectFolder`, `project.workingFolder`, `project.actionsFolder`, `project.releasesFolder`, `project.diagramsFolder`, `project.archivedFolder`. Explanation: these paths say where MD² reads and writes this project's files; every folder except the project folder is relative to it.
  * **Cards** — `project.cardSeparator`, `project.cardTypes`, `project.states`.
  * **Git** — `project.diffCommand`, `project.pushMode`.
  * **Appearance** — `project.backgroundShade`.
  * **Diagrams** — `project.diagramFooter`, moved to the end of the tab as requested.
  * `WorktreeConfigList` stays last, under its existing condition.
* Drive the grouping from one module-level constant in `project_config_section.tsx`, for example `PROJECT_CONFIG_GROUPS: { description, id, keys, label }[]`, and render each group by filtering the section entries by `keys`. Any project entry that is editable and not listed in a group must still render, in a trailing ungrouped stack, so adding a config entry later cannot make it silently invisible.
* Add `CardTypesEditor` in `app/src/components/config/card_types_editor.tsx`, wired into `ConfigValueEditor` through an `entry.key === 'project.cardTypes'` branch that mirrors the existing `desktop.agentProfiles` branch (`FormControl` + `FormLabel` + editor + `FormHelperText` with the entry description). Its props are `disabled`, `onChange(value: CardTypeConfig[])`, `onValidityChange(valid: boolean)` and `value: CardTypeConfig[]`.
  * The collapsed view is a wrapping row of one `Button` per card type. Each button uses the type's `color` as its background, shows the type's `label`, and picks black or white text from the colour's relative luminance so a light accent stays readable. Clicking a button opens the detail form for that type; a trailing `Add card type` button with a `Plus` icon opens the form for a new one.
  * The detail form holds: `Label` (text), `Type` (text), `ID prefix` (text) and `Color` (`TextField type="color"` with `slotProps={{ inputLabel: { shrink: true } }}`, matching `ThemeSettingsDialog`), plus `Save`, `Cancel` and `Delete`. `Type` stays editable for existing card types, as decided: renaming it does not migrate cards, so the form shows a warning line under the field stating that cards already using the old value keep it and lose their colour and prefix until it is set back.
  * Validation, surfaced as an `Alert severity="error"` in the form the way `AgentProfilesEditor` does, and reported through `onValidityChange`: `label`, `type` and `idPrefix` are non-empty, `type` and `idPrefix` are unique across the list, `color` is a non-empty string, and at least one card type remains after a delete (`validateCardTypes` rejects an empty array).
  * Deleting is allowed without scanning cards. Instead, when the draft's card type list no longer contains a `type` value that the saved config had, `ConfigPage` raises `dialogService.warning` once on save, in the same place and shape as the existing card separator warning, stating that cards using the removed type will render without a colour or ID prefix.
* Add `ColumnsEditor` in `app/src/components/config/columns_editor.tsx`, wired into `ConfigValueEditor` through an `entry.key === 'project.states'` branch, with the same prop shape over `StateConfig[]`.
  * The collapsed view is the same coloured-button row, one button per column showing `state`, in array order, since that order is the board column order. Clicking opens the detail form; a trailing `Add column` button appends a new one whose colour defaults to `defaultColumnAccent(nextIndex)`.
  * The detail form holds `Name` (the `state` string), `Color`, `Save`, `Cancel`, `Delete`, and a `Move left` / `Move right` pair of `IconButton`s that reorder the column within the array, disabled at the ends. Reorder is done with those buttons rather than drag and drop: it is keyboard reachable, testable with a plain click, and needs no `@dnd-kit` wiring inside the dialog.
  * `alwaysVisible` and `defaultActionId` are not exposed in the form, per the scoping decision. The editor must therefore carry them through unchanged on every edit, reorder and add (a new column gets `alwaysVisible: true` and no `defaultActionId`). Flagging one consequence: with the JSON textarea gone, those two fields become unreachable from the config dialog and can then only be changed by editing the project config file by hand.
  * Validation: `state` is non-empty, `state` values are unique (matching `validateStates`), and at least one column remains.
  * Removing a column that cards are still in gets the same save-time `dialogService.warning` treatment as a removed card type.
* Leave `project.cardTypes` and `project.states` as `type: 'json'` entries in `config_entries.ts` and leave `validateCardTypes` / `validateStates` untouched, so the stored format and the file-load path do not change. Remove `'project.cardTypes'` and `'project.states'` from `MONOSPACE_CONFIG_KEYS` in `config_value_editor.tsx`, since neither renders as a textarea any more.
* Tests: add `card_types_editor.grouped.test.tsx` and `columns_editor.grouped.test.tsx` next to the existing `*.grouped.test.tsx` files, covering add, edit, colour change, delete, the uniqueness and non-empty validation paths and the resulting `onValidityChange(false)`, and — for columns — that `Move left` / `Move right` reorder the array and that `alwaysVisible` and `defaultActionId` survive an edit. Replace the `edits project columns as ordered JSON definitions` case in `config_page.test.tsx` with one that drives the new column editor, and add a case asserting the Folders, Cards, Git, Appearance and Diagrams group headings appear in that order in the project tab. Verify with `npm run typecheck` and the config vitest suites.

## acceptance criteria

* The project tab shows five headed groups in this order — Folders, Cards, Git, Appearance, Diagrams — each with a one-line explanation under its heading, followed by the worktree list where it is supported.
* Folders holds project, working, actions, releases, diagrams and archived folder; Cards holds card separator, card types and columns; Git holds diff command and push mode; Appearance holds background shade; Diagrams holds the diagram footer, which is the last config field on the tab.
* An editable project config entry that is not assigned to a group still renders on the tab rather than disappearing.
* Card types render as a row of buttons, one per type, each filled with that type's colour, labelled with that type's label, and with text contrast readable against both light and dark accents.
* Clicking a card type button opens a form with Label, Type, ID prefix and a colour input; saving applies the change to the draft, and Cancel leaves the draft untouched.
* `Add card type` appends a new type; `Delete` removes one; deleting the last remaining card type is blocked.
* Editing a card type's Type field is allowed and shows a warning that existing cards keep the old value and lose their colour and ID prefix.
* Duplicate Type or ID prefix values, or an empty Label, Type or ID prefix, show an inline error and disable Save, and the config dialog's Save button stays disabled while that entry is invalid.
* Columns render the same way, in board order; clicking one opens a form with Name, colour, Move left, Move right, Save, Cancel and Delete.
* `Move left` and `Move right` change the column's position in the stored array and are disabled at the first and last position respectively.
* Editing, moving or adding a column preserves the `alwaysVisible` and `defaultActionId` values of every other column, and of the edited column itself.
* Duplicate or empty column names show an inline error and disable Save; deleting the last remaining column is blocked.
* Saving a draft that removed a card type or a column raises one warning dialog naming what was removed, and then saves normally when confirmed.
* Neither card types nor columns renders as a JSON textarea any more, and the stored project config format for both is byte-compatible with what the previous JSON editor produced.
* `npm run typecheck` passes and the config page, card types editor and columns editor test suites pass.
