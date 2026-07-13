---
id: F-8
title: Signed Windows Electron package with bundled React app
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 964fdcac-159c-49dc-af83-79f532e9651d
---

## Goal
Produce an installable, Authenticode-signed Windows Electron application that contains the React production build and runs without a separately hosted website or development server.

## Current state
Development starts Vite on `http://localhost:5173` and then launches Electron. `desktop/main.js` always calls `window.loadURL(appUrl)`, with the URL defaulting to the Vite development server. The React app has a production build command, but that output is not included in an Electron package.

There is no Electron packaging tool or configuration, Windows installer target, application icon, production renderer-loading path, signing configuration, packaging script or packaged-application smoke test. The desktop package can only be started from its source checkout.

## implementation details
- Use `electron-builder` in the desktop build toolchain and produce a Windows x64 NSIS installer. Also retain the unpacked application output for local smoke testing; portable distribution, auto-update and release publishing are outside this feature.
  - use `npm install` an don't manually add `electron-builder` to `package.json`.
- Add a root build command that runs the React production build first and then packages Electron. The package must include only the required Electron runtime files, production dependencies, shared runtime modules and built React assets.
- Bundle application code in the default ASAR archive. Place the React build at a deterministic packaged path that `desktop/main.js` can resolve without depending on the source checkout.
- Keep development behavior unchanged: an unpackaged Electron process loads the configured Vite URL. A packaged process loads the bundled React entry point and must not use `MD2_APP_URL` as its normal renderer source.
- Configure Vite asset paths for packaged loading so JavaScript, CSS, fonts, icons and other assets resolve from the bundled entry point. Direct startup must not produce a blank window or failed `/assets/...` requests.
- Update the preload origin/trust check for the packaged renderer. The bundled page receives the privileged bridges; navigations or popups to remote content must not receive them. Preserve `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`.
- Prevent unexpected navigation away from the bundled application and open approved external links in the user's default browser rather than inside the privileged application window.
- Define stable Windows metadata: application id, product name, executable name, publisher name, version and copyright. Derive the package version from one authoritative package version rather than maintaining unrelated versions manually.
- Create a Windows `.ico` asset from the existing MD² branding and use it for the executable, window and NSIS installer. Do not use Electron's default icon in release artifacts.
- Sign the application executable and installer with the user's Windows application certificate through electron-builder's signing support. Use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for an exportable PFX/P12 certificate; if the available certificate is hardware-backed or installed in the Windows certificate store, select it by its supported subject name or thumbprint instead.
- Enable mandatory signing for release builds so missing, expired or invalid signing configuration fails the build instead of silently producing unsigned artifacts. Use a trusted timestamp service so the signature remains valid after certificate expiry.
- Keep the certificate file, password, private key and encoded certificate out of source control, package contents and logs. Document the required environment variables or certificate-store setup for local and CI builds.
- Write artifacts to an ignored output directory with predictable names containing the product version and architecture.
- Do not add automatic update checks, GitHub release upload, Microsoft Store/MSIX packaging or non-Windows targets in this feature.

## Edge cases and failure modes
- The React build fails: do not run packaging with stale renderer assets.
- Renderer assets are missing from the package: fail the build or smoke test before distribution.
- Signing credentials are absent or invalid: fail the release package command and do not retain an apparently releasable unsigned installer.
- The certificate is hardware-backed: support signing on the Windows machine that owns the key; do not attempt to export the private key into the repository or CI.
- The installed application starts without a network connection: the bundled UI and local-folder project flow must remain usable.
- Paths contain spaces or non-ASCII characters: the installed application, bundled renderer and selected project folder must still load correctly.
- The application is installed over an older version: preserve Electron-store desktop settings and do not store writable user data inside the application installation or ASAR.

## testing implications
- Keep `npm run lint` and `npm run test` mandatory in both `app/` and `desktop/` before packaging; run the React typecheck/build as part of the package command.
- Add tests for development-versus-packaged renderer resolution and for rejection of remote navigation in the privileged window.
- Add a packaging verification step that checks the expected React entry point, preload, main-process files and required production dependencies are present in the packaged application.
- Smoke-test the unpacked application and installed NSIS build on Windows without Vite or a network connection. Open a local Git project and exercise a read, edit/commit, branch list and action invocation.
- Verify both the packaged executable and installer with `Get-AuthenticodeSignature`; require a valid signature, the expected publisher and a timestamp.
- Confirm no certificate material, signing password, development source map or development-server URL is present in the artifacts.

## acceptance criteria
- One documented command builds the React app and creates a versioned Windows x64 NSIS installer plus an unpacked smoke-test application.
- The installed application starts without Vite, a hosted website or network access and loads the bundled React UI.
- The packaged UI receives the required Electron bridges and can open and operate on a local Git project.
- Remote navigation cannot retain access to the privileged preload bridges.
- The application executable and installer have valid Authenticode signatures from the configured application certificate and include a trusted timestamp.
- A release build fails when signing is required but cannot be completed.
- The installer, executable and Windows application list use MD² product metadata and branding rather than Electron defaults.
- Signing secrets and private certificate material are absent from Git history and packaged artifacts.
- Existing desktop settings survive an application upgrade.

## see also
- `design\feature_descriptions\F_041_electron_local_folder_projects.md`
- `design\feature_descriptions\ready\F_013_desktop_app.md`
- `design\feature_descriptions\ready\B_015_electron_context_isolation.md`
- `design\feature_descriptions\ready\B_029_desktop_bridge_security_hardening.md`
- `design\architecture\initial description\desktop app.md`

