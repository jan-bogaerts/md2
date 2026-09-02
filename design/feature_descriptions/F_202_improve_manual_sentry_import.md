---
author: 
id: F_202
internalId: 2ba8b222-8131-4283-9263-be319a8fed6f
title: improve manual sentry import
status: ready
owner: 
affects:
agents:
  - design/activity/card__2ba8b222-8131-4283-9263-be319a8fed6f.json
policy:
after: f5e9bc66-ebde-41f7-ae6e-503e9e8e284a
---
currently:

> Manual import exists only in config page:

> Config > Sentry > Import now

> Automatic import setting does not control this button. Button enables when:

> Sentry connection is authenticated.
> All Sentry/card settings are complete.
> Project is writable.
> No import currently runs.
> No menu, toolbar, command palette, or project-level action exists elsewhere. So discoverability is poor; user must reopen Sentry config to import manually.

We should add a button to the run menu for importing bugs

## Current state

Manual Sentry import has exactly one entry point: `app/src/components/config/sentry_config_section.tsx`, the "Import now" button in Config > Sentry. It calls `sentryImportService.importNow()`, which runs `poll(true)` in `app/src/services/sentry/sentry_import_service.ts`.

That button enables only when `canImport` holds: a project is open, the project is not read-only, the connection is not mid-connect, `connection.isAuthenticated` is true, `settingsComplete(connection.settings)` is true, and `importState.isPolling` is false. "Settings complete" means every one of `apiBaseUrl`, `apiToken`, `organization`, `project`, `environment`, `cardType`, `cardState` is non-empty. The "Enable automatic import" switch is a separate stored setting (`automaticImport`) that drives the 15-minute background schedule only; it does not gate the manual button.

The completeness check is duplicated: `settingsComplete` in `sentry_config_section.tsx` and `isComplete` in `sentry_import_service.ts` have identical bodies.

The Run menu is the second tab of the main menu in `app/src/components/shell/menu/app_menu.tsx`: tab value `agents`, label `Run`. Its right-hand group is `<Section label="Actions">`, currently holding `ActionEntryPoints` plus the "Complete release" `MenuIconButton`. The same `AppMenu` renders on desktop and mobile through `MainToolbar`, so anything added to that section appears on both.

First-import confirmation is already global: `SentryImportConfirmationDialog` is mounted once in `app/src/app.tsx`, opens on `snapshot.confirmation`, and is therefore reachable regardless of which button started the import.

Consequence: a user who wants an on-demand import must leave their board, open Config, scroll to the Sentry section, click, and navigate back. Discoverability and cost per manual import are both poor.

## Implementation details

* Export one shared completeness predicate — `isSentryConfigurationComplete(settings: SentryProjectSettings)` — from `app/src/services/sentry/sentry_types.ts`. Replace both `settingsComplete` in `sentry_config_section.tsx` and `isComplete` in `sentry_import_service.ts` with it. No behavior change; single source of truth for the new button's gating.
* Add a `MenuIconButton` labelled `Import Sentry issues` to `<Section label="Actions">` in `app_menu.tsx`, placed after "Complete release". Icon: `BugOutline` from `mdi-material-ui`, `fontSize="small"`, matching neighbouring buttons.
* Render the button conditionally, not permanently disabled. It mounts only when a project is open, `useSentryConnection().isAuthenticated` is true, and `isSentryConfigurationComplete(connection.settings)` is true. When Sentry is unconfigured or disconnected the Run menu looks exactly as it does today.
* Once mounted, disable it when the project is read-only (`useProjectReadOnly()`) or `useSentryImport().isPolling` is true. Tooltip while polling: `Checking Sentry...`; otherwise the label.
* `onClick` calls `void sentryImportService.importNow()`. No new service method, no new state, no local copy of import status — read status through the existing `useSentryImport` / `useSentryConnection` hooks, which are `useSyncExternalStore` subscriptions over the services' scoped `changed` events.
* Because both buttons share `sentryImportService.isPolling`, a run started from either entry point disables the other for its duration; no second concurrent poll can start.
* If `firstImportConfirmed` is false, `importNow()` sets `confirmation` instead of writing cards, and the already-mounted `SentryImportConfirmationDialog` opens over the Run menu. Do not mount a second dialog.
* Errors surface through the existing paths: `sentryConnectionService.handleApiError` may drop authentication (which then unmounts the button), and `latestError` remains visible in the Sentry config section. The Run menu shows no error text of its own.
* Mobile requires no extra work: it uses the same `AppMenu` Run tab. Do not gate on `isMobile`.

## Tests

* `app_menu.test.tsx`: button absent when no Sentry connection; present when authenticated with complete settings; disabled while `isPolling`; disabled when project is read-only; click calls `sentryImportService.importNow` once.
* `sentry_config_section.test.tsx`: existing "Import now" gating still passes after the swap to the shared predicate.
* A node test asserting `isSentryConfigurationComplete` rejects each individually missing field.

## Acceptance criteria

* Run menu > Actions shows an "Import Sentry issues" button whenever the open project has an authenticated Sentry connection with complete settings, on desktop and mobile.
* The button is absent — not greyed out — when no project is open, the connection is not authenticated, or any required Sentry setting is empty.
* When visible, the button is disabled while the project is read-only or an import is running, and re-enables when the import finishes.
* Clicking it runs the same import as Config > Sentry > Import now, including first-import confirmation through the existing global dialog.
* Import status, counts, and errors continue to appear in the Sentry config section; the Run menu adds no duplicate status surface.
* `automaticImport` still governs only the background schedule and does not affect the new button.
* Completeness checking exists in exactly one exported function used by the config section, the import service, and the Run menu button.
* `npm run typecheck`, `npm run lint`, and app tests pass.

## See also

* `app/src/components/shell/menu/app_menu.tsx`
* `app/src/components/config/sentry_config_section.tsx`
* `app/src/services/sentry/sentry_import_service.ts`
* `app/src/components/sentry_import_confirmation_dialog.tsx`
