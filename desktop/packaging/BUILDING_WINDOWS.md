# Signed Windows package

Run from repository root:

```powershell
npm run build:windows
```

This command builds React first, then creates signed Windows x64 artifacts in `release/`:

- `MD2-Setup-<version>-x64.exe`
- `MD2-<version>-win-x64-unpacked/`

`desktop/package.json` is authoritative for product version. Packaging fails if React build, required packaged files, signing, timestamp, publisher verification, or artifact checks fail.

## Signing configuration

Always set `WIN_CSC_PUBLISHER_NAME` to text present in certificate subject. This value verifies both executable and installer after packaging.

For exportable PFX/P12 certificates, provide secrets through local or CI secret storage:

- `WIN_CSC_LINK`: secure file path, URL, or base64 certificate value supported by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: certificate password.
- `WIN_CSC_PUBLISHER_NAME`: expected certificate publisher.

For hardware-backed certificates or certificates installed in Windows certificate store, do not export key. Configure one or both selectors:

- `WIN_CSC_SUBJECT_NAME`: certificate subject name.
- `WIN_CSC_SHA1`: certificate thumbprint.
- `WIN_CSC_PUBLISHER_NAME`: expected certificate publisher.

Build uses SHA-256 signing, mandatory signing, and DigiCert RFC 3161 timestamp service. Never place certificate files, passwords, private keys, or encoded certificates in repository files, `.env` files, command arguments, logs, or package folders.

## Local and CI checks

Before release, run `npm run lint` and `npm run test` in both `app/` and `desktop/`. Build command also runs React typecheck/build and checks ASAR contents, production dependencies, renderer assets, forbidden certificate/source-map files, development-server URL, executable signature, installer signature, publisher, and timestamp.

Smoke-test unpacked application and installed NSIS build with Vite stopped and network disconnected. Open local Git project; read and edit file, commit, list branches, and invoke action. Install over prior version and confirm desktop settings remain present.
