# Release process

md² tracks its own work with md². The mechanics below are the same ones any project gets.

## Cards during a release

Active cards live in the working folder. Each card is a feature (`F_`), job (`J_`), or bug (`B_`) and moves across the board as it is designed, implemented, and finished.

## Completing a release

**Complete release** (Run tab of the menu) asks for a release name and then:

1. creates a subfolder with that name under the releases folder;
2. moves every active card into it;
3. moves images referenced by those cards along with them, so relative links keep working;
4. leaves the board empty for the next cycle.

Release names must be plain (letters, digits, `.`, `-`, `_`).

Cards you want off the board without belonging to a release go to the archived folder instead.

In this repository the result looks like [`design/releases/0_0_3/`](../../design/releases/0_0_3/): one Markdown file per card plus `release_notes.md`.

## Release notes

`release_notes.md` in the release folder is written from the cards it contains — one user-visible line per change, not per commit. See [`design/releases/0_0_3/release_notes.md`](../../design/releases/0_0_3/release_notes.md) for the tone.

## Versioning

`desktop/package.json` is authoritative for the product version; packaging reads it and names the artifacts after it. Bump it before building.

## Shipping a Windows build

```powershell
cd app && npm run lint && npm run typecheck && npm run test
cd ../desktop && npm run lint && npm run test
cd .. && npm run build:windows
```

The build fails on unsigned or unverifiable artifacts, missing packaged files, a dev-server URL leaking into the bundle, or stray certificate and source-map files. Smoke-test the installed build with the dev server stopped: open a local Git project, edit and commit a file, list branches, run an action, and install over the previous version to confirm settings survive.

Details and signing configuration: [`desktop/packaging/BUILDING_WINDOWS.md`](../../desktop/packaging/BUILDING_WINDOWS.md).

See also: [Development setup](development-setup.md), [Project layout](../concepts/project-layout.md).
