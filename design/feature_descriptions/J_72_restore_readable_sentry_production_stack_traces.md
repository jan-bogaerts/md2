---
author: 
id: J_72
internalId: d9488ddc-6774-41c7-a7cc-eb4aa3283e20
title: restore readable Sentry production stack traces
status: ready
owner: 
affects:
agents:
  - design/activity/card__d9488ddc-6774-41c7-a7cc-eb4aa3283e20.json
policy:
branch: j_72_restore_readable_sentry_production_stack_traces
worktree: 2
changedFiles:
  - app/src/main.test.tsx
  - app/src/main.tsx
  - app/src/services/telemetry/telemetry_service.ts
  - desktop/main.js
  - desktop/main.test.mjs
  - desktop/packaging/verify_renderer_source_maps.js
  - desktop/packaging/verify_renderer_source_maps.test.mjs
  - desktop/packaging/verify_windows_package.test.mjs
---

Production renderer errors reach Sentry without the source information required to recover their original TypeScript and React locations. Restore reliable error capture and readable stack traces for the Electron main process and renderer.

## Current state

The React production build explicitly sets `build.sourcemap` to `false` in `app/vite.config.ts`. The build and release pipeline contains no Sentry Vite plugin, Sentry CLI upload, source-map authentication variables, or other source-map upload step. The generated `app/dist` therefore contains minified JavaScript without source maps.

`desktop/packaging/builder_config.js` excludes `*.map` files from both the application package and renderer assets. Excluding maps from the shipped application is correct, but no earlier build step uploads them to Sentry before packaging removes them.

The Electron main process uses `@sentry/electron/main`, but the renderer initializes `@sentry/react` directly. Sentry's Electron SDK expects every renderer to initialize through `@sentry/electron/renderer`. React support is retained by passing the `@sentry/react` initializer to the Electron renderer initializer. The current direct browser client can report renderer errors, but it does not use the Electron renderer integration or route events through the main-process SDK.

Initialization also occurs too late to cover all startup failures:

* `desktop/main.js` loads application modules and constructs services before starting Electron telemetry and registering process error handlers.
* `app/src/main.tsx` starts renderer telemetry only after asynchronous application-storage initialization succeeds.

The main-process source files are shipped as JavaScript without bundling, so their stack locations do not require renderer source maps. Source maps are required for transformed renderer bundles and any future bundled main-process code.

## Implementation details

1. Initialize `@sentry/electron/main` before loading application modules that can fail during import or construction. Register uncaught-exception and unhandled-rejection capture immediately after successful initialization.
2. Initialize the renderer through `@sentry/electron/renderer` and combine it with the `@sentry/react` initializer. Keep React-specific capture behavior while allowing the Electron SDK to coordinate renderer events with the main process.
3. Start renderer telemetry before asynchronous application initialization. Storage startup failures must be capturable without depending on storage initialization succeeding.
4. Add the official Sentry Vite plugin to the renderer build and enable hidden production source maps. The plugin must run after the other Vite plugins so its debug IDs and uploaded artifacts match the final emitted bundles.
5. Upload source maps during `npm run build --prefix app`, before Electron packaging starts. Use build-only `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` values. Do not expose the authentication token through an `MD2_` or other Vite client environment prefix.
6. Keep source maps out of the packaged ASAR and installer. Delete them after a successful upload or retain the existing package filters as the final safeguard.
7. Treat a configured production source-map upload failure as a release-build failure. Do not silently produce a release whose renderer errors cannot be symbolicated.
8. Keep `MD2_SENTRY_DSN` as the runtime DSN read by the Electron main process. Renderer initialization must use the Electron SDK's main-process transport rather than creating a separate production client configuration.
9. Set consistent release and environment metadata for main and renderer events if required by the selected Sentry artifact-matching flow. Do not derive domain identity from file paths or release artifact paths.
10. Do not add compatibility branches for the current direct renderer client. Replace it with the Electron renderer integration.

## Build and packaging behavior

The required order is:

1. Build the renderer with hidden source maps.
2. Inject matching Sentry debug IDs into the final renderer bundles.
3. Upload the final JavaScript artifacts and source maps to Sentry.
4. Fail the build if the configured upload fails.
5. Package the application without source-map files.

The Sentry authentication token is a build secret. It must not be written to `desktop/.env`, copied into `resources/.env`, embedded in renderer assets, or included in the installer. The DSN is public runtime configuration and may continue to be packaged through the existing environment flow.

## Tests and verification

* Add focused renderer telemetry tests proving that Electron runtime initialization uses the Electron renderer SDK combined with the React initializer.
* Preserve web-runtime Sentry behavior if the standalone web build remains supported; it may continue to initialize the React SDK directly because no Electron main process exists there.
* Add main-process tests proving that Sentry initialization and process handlers are installed before application services start.
* Add Vite configuration tests for hidden production source maps and the Sentry upload plugin.
* Update package verification tests to confirm that source maps and Sentry upload secrets are absent from the ASAR and installer resources.
* Add a release-build verification that inspects emitted renderer bundles for Sentry debug IDs and confirms that source maps were generated for upload before packaging.
* Perform one production smoke test that captures an error from an application-owned TypeScript/React source file. The Sentry event must show the original file, function, line, and surrounding source context rather than only the minified `index-*.js` location.
* Perform one production main-process smoke test to confirm that an application-owned JavaScript error reports its original file and line.
* Run focused app and desktop tests, both linters, the app type check, and the Windows package verification. Do not run the full test suites unless separately requested.

## Out of scope

* Changing the Sentry project, organization, retention policy, or alert rules.
* Adding performance tracing, session replay, user feedback, or additional personally identifiable information.
* Changing Aptabase telemetry.
* Shipping source maps inside the application package.
* Bundling the Electron main process.

## Acceptance criteria

* Production renderer events use `@sentry/electron/renderer` combined with the React SDK; the main process continues using `@sentry/electron/main`.
* Main and renderer Sentry initialization occurs early enough to capture import, construction, and asynchronous startup failures.
* Every production renderer bundle has a matching source map uploaded to Sentry before packaging.
* A configured source-map upload failure stops the release build with a clear error.
* No source map or Sentry authentication secret is present in the ASAR, unpacked application resources, or installer.
* A production renderer exception displays its original application-owned source file, function, line, and source context in Sentry.
* A production main-process exception displays its original application-owned JavaScript file and line in Sentry.
* Standalone web behavior remains supported if it is currently part of the product, without requiring an Electron main process.
* Existing error reporting and Aptabase behavior remain unchanged apart from earlier Sentry coverage and readable Sentry stack traces.
