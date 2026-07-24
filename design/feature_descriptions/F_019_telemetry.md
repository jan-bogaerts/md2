---
id: F-019
title: telemetry
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Add Sentry error reporting and Aptabase usage logging in both the React and Electron apps, tracking key events (create/open project, create card, start, navigation, stop) without details, with keys kept out of the repository.

## implementation details
- Add app-side telemetry services in `app/src/services/` for Sentry initialization, Aptabase event logging and error capture; register through `service_injector` and initialize from app bootstrap, not module load.
- Add desktop telemetry initialization in `desktop/main.js` before `app.whenReady()` work starts, so `electron_starting` is emitted before window creation and startup errors are captured.
- Keep DSNs/app keys in untracked local config files or environment variables per subproject; tracked sample files may document required names but must not contain real keys.
- Track only event names and coarse runtime context (`react_web` or `react_electron`) with no project id, repository, branch, card title, file path, user content or error payload in Aptabase event properties.
- Instrument `DataService.createProject`, `DataService.openProject` and `DataService.createCard` after successful completion so usage events match persisted behavior.
- Track React start from `main.tsx` or `use_app_bootstrap`; classify it as `react_web` when no Electron bridge exists and `react_electron` when the preload bridge is present.
- Track navigation at the UI boundary where the selected route/view/card changes. Current card selection in `ProjectWorkspace` counts as navigation; future URL-backed views should emit the same event without path/title details.
- Track stop from React `beforeunload` and Electron quit/window-close lifecycle paths. Flush pending telemetry before exit without blocking normal shutdown indefinitely.
- Capture unhandled errors and promise rejections in React, and main-process errors in Electron, through Sentry. Existing domain errors still surface to the UI as they do today.
- Add tests with mocked telemetry clients for service initialization, no-op behavior when keys are absent, event emission for create/open/card/navigation/start/stop, and exclusion of domain details from Aptabase payloads.

## acceptance criteria
- React and Electron initialize Sentry and Aptabase when local keys are configured, and run without telemetry failures when keys are missing.
- No real telemetry key, DSN or app id is committed to the repository.
- Electron emits `electron_starting` before creating the browser window.
- React emits one start event per app load, classified as web or Electron-connected.
- Successful create project, open project and create card operations emit usage events only after the operation succeeds.
- Card/view navigation emits a navigation event without project, card, path, title or content data.
- React unload and Electron shutdown emit stop events and attempt a bounded flush.
- Sentry receives uncaught React/Electron errors; Aptabase receives only allowed event names and coarse runtime context.
- Unit tests cover telemetry service behavior and instrumentation points; React/Electron tests mock external SDKs and do not send network telemetry.

## see also
- `design\architecture\initial description\telemetry.md`
