---
author: 
id: F_392
internalId: 4bcc15e9-9de2-4f17-8df9-40205ed9777c
title: Add groups to sentry config tab
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__4bcc15e9-9de2-4f17-8df9-40205ed9777c.json
policy:
after: 50466266-0fa0-4392-855a-d21513ee700f
branch: f_392_add_groups_to_sentry_config_tab
worktree: 1
---

On the config dialog, we have the project and sentry tabs. On the project tab, we already created groups. Now we need to do the same on the sentry tab. Group the items logically together, add title and some info where useful

## Current state

* `ConfigPage` (`app/src/components/config/config_page.tsx`) renders `<SentryConfigSection />` for the `sentry` tab. Sentry settings are not config entries: they live per MD² project in browser `localStorage` (`SENTRY_CONNECTION_STORAGE_KEY`) via `sentryConnectionService`, so the dialog's Save/Cancel buttons do not touch them.
* `SentryConfigForm` in `app/src/components/config/sentry_config_section.tsx` renders one `h3` "Sentry" heading, a description line ("Credentials stay in this browser."), an info `Alert` when no project is open, then one flat `Stack spacing={3}` in this order: API base URL, Organization slug, Project slug, Environment, Sentry API token, Target card type, Target card state, connection error `Alert`, Connect/Reconnect + Disconnect buttons, `Enable automatic import` switch, `Import now` button + "Checking Sentry..." text, last import count, last successful poll time, latest import error `Alert`.
* All text and select fields edit a local `draft`. The draft (including card type and state) is persisted only when the user presses Connect/Reconnect (`sentryConnectionService.connect`). Connect is enabled only when `isSentryConfigurationComplete(draft)` is true, which requires card type and card state too. The automatic-import switch saves immediately through `saveSettings`.
* Import controls are enabled only when connected and complete (`canImport`). Automatic import polls every `SENTRY_POLL_INTERVAL_MS` (15 minutes) while the project is fully loaded and not read-only. The first import that finds new issues, manual or automatic, asks for confirmation (`firstImportConfirmed`).
* The project tab (F_370) already groups fields with `ConfigSubsection` (`app/src/components/config/config_subsection.tsx`): an outlined `Card` with `component="section"`, an `h4` heading, a description line, and children in a `Stack spacing={3}`. `ProjectConfigSection` stacks its groups with `Stack spacing={4}`.
* Tests: `sentry_config_section.grouped.test.tsx` finds controls by label and button/switch name only; `config_page.test.tsx` only checks the Sentry tab label and href. Field ids `sentry-api-base-url`, `sentry-organization`, `sentry-project`, `sentry-environment`, `sentry-api-token` are already used, so group ids must not reuse them.

## implementation details

* Only `sentry_config_section.tsx` and its test change. No service, storage, or behavior changes; every field label, helper text, button name, and enable/disable rule stays as-is.
* Keep the `h3` "Sentry" heading, the section description, and the no-project `Alert` at the top. Change the outer `Stack` to `spacing={4}` to match `ProjectConfigSection`.
* Wrap fields in `ConfigSubsection`, in this order. Group descriptions are module-level string constants.
  1. **Sentry project** (`id="sentry-source"`): API base URL, Organization slug, Project slug, Environment. Description: "Which Sentry issues MD² reads: unresolved issues from one project and one environment."
  2. **Authentication** (`id="sentry-authentication"`): Sentry API token. Description: "Token MD² uses to read issues. It is stored only in this browser for this MD² project, never in project files."
  3. **Imported cards** (`id="sentry-card-target"`): Target card type, Target card state. Description: "What each new Sentry issue becomes on the board. Changes apply when you press Connect or Reconnect."
  4. Connection error `Alert` and the Connect/Reconnect + Disconnect row stay ungrouped, directly below group 3. Reason: Connect needs and saves the fields of groups 1–3, so the button sits after all of them instead of inside one group.
  5. **Import** (`id="sentry-import"`): automatic-import switch, Import now row with "Checking Sentry..." text, last import count, last successful poll time, latest import error `Alert`. Description: "Available after connecting. Automatic import checks Sentry every 15 minutes while this project is open and editable. The first import that finds new issues asks for confirmation before creating cards."
* The section description becomes "Connect this MD² project to one Sentry project." (the credentials sentence moves into the Authentication description).
* Render groups inline in `SentryConfigForm`; no group-config array (groups hold mixed controls, not config keys) and no new component (groups 1–3 share `draft`).
* Tests in `sentry_config_section.grouped.test.tsx`: add one case asserting the four group headings (`getAllByRole('heading', { level: 4 })`) appear in order Sentry project, Authentication, Imported cards, Import, and that representative controls sit inside their group via `within(screen.getByRole('region', { name: ... }))`: Organization slug in Sentry project, Sentry API token in Authentication, Target card type in Imported cards, `Enable automatic import` in Import. Existing cases must pass unchanged. Verify with `npm run typecheck` and `npm run test -- src/components/config/config_no_mock.test.tsx`.

## acceptance criteria

* The Sentry tab shows four headed groups in order: Sentry project, Authentication, Imported cards, Import; each has a one-line description under its heading.
* Sentry project holds API base URL, Organization slug, Project slug, Environment; Authentication holds the API token; Imported cards holds target card type and state; Import holds the automatic-import switch, Import now, and import status/error lines.
* Connection error and Connect/Reconnect + Disconnect buttons appear below Imported cards and above Import.
* Field labels, helper texts, button names, and enable/disable behavior (no project, read-only, not connected, polling) are unchanged.
* Group layout matches the project tab (outlined card, `h4` heading, secondary description).
* No element id is duplicated on the page.
* `npm run typecheck` passes and the Sentry config section tests pass, including the new grouping test.