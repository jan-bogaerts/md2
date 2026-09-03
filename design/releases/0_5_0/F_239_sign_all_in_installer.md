---
author: 
id: F_239
internalId: 1c141485-6431-438a-a4ca-9443f75443e2
title: sign all in installer
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__1c141485-6431-438a-a4ca-9443f75443e2.json
policy:
after: 2e5a2329-ae2b-4afa-9d93-7d77c7b25b89
---

We build an installer for the electron app. this gets signed by our own certificate. however, it seems we only sign the electron executable. When installing on a windows machine with full protection on, it complains that not all executables in this installer were signed. We have seen this before with another electron app. the solution was to sign all executable code in the package.

can you update the build script so we sign everything that needs to be signed?

## Current state

`npm run build:windows` builds the React app, then runs Electron Builder's Windows x64 NSIS target. `forceCodeSigning` requires a configured certificate, and Electron Builder signs `.exe` files by default. Current config does not opt `.dll` or `.node` files into signing, although packaged Electron runtime and native dependencies contain both. A `.node` file is a native Node.js addon: executable Windows code loaded by Node.js or Electron.

After packaging, npm automatically runs `postpackage:windows`. Its verifier checks package contents and validates Authenticode signatures only on `md2.exe` and outer NSIS installer. It therefore cannot detect unsigned DLLs, native addons, or helper executables elsewhere in unpacked application.

## implementation details

* Add `.dll` and `.node` to Electron Builder `win.signExts` in `builder_config.js`. Keep default `.exe` signing, SHA-256 digest, RFC 3161 timestamping, certificate selection, and `forceCodeSigning` unchanged.
* Treat `.exe`, `.dll`, and `.node` files as packaged Windows executable code. Electron Builder must sign these files before NSIS compresses application into installer.
* Extend `verify_windows_package.mjs` to recursively collect every matching file under versioned unpacked application directory, then validate each file plus outer installer with `verify_authenticode.ps1`.
* Require every checked signature to be valid, issued to configured `publisherName`, and timestamped. Any missing, invalid, wrong-publisher, or untimestamped signature must fail post-package verification and therefore fail Windows build.
* Keep certificates and signing secrets outside package. Do not change artifact names, bundled application contents, installer target, architecture, or certificate configuration format.
* Add focused tests for signing extensions and recursive executable-code discovery. Keep real Authenticode checks at packaging boundary because unit tests must not require certificate or PowerShell certificate store.

## acceptance criteria

* Windows build signs every packaged `.exe`, `.dll`, and `.node` file with configured publisher certificate before building NSIS installer.
* Outer `MD2-Setup-<version>-x64.exe` is signed with same configured publisher certificate after installer creation.
* Every checked signature has valid Authenticode status and timestamp; one failure makes `npm run build:windows` fail.
* Recursive verification covers executable code in root, `resources`, `app.asar.unpacked`, and dependency subdirectories without relying on fixed filenames.
* Files outside executable-code extensions are not passed to Authenticode verification.
* Builder-config tests assert `.dll` and `.node` signing while preserving default `.exe` signing and mandatory code signing.
* Package-verification tests cover nested `.exe`, `.dll`, and `.node` discovery, irrelevant-file exclusion, and complete verification input.
* `npm run test:full` and `npm run lint` pass in `desktop/`.
