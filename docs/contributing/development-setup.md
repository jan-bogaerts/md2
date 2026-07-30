# Development setup

## Layout

| Folder | What it is |
| --- | --- |
| [`app/`](https://github.com/jan-bogaerts/md2/tree/main/app) | React + Vite web UI. TypeScript. |
| [`desktop/`](https://github.com/jan-bogaerts/md2/tree/main/desktop) | Electron host: file system, Git, action runner, agents, remote control. JavaScript. |
| [`shared/`](https://github.com/jan-bogaerts/md2/tree/main/shared) | Logic and types used by both, as `.mjs` with `.d.mts` declarations. |
| [`design/`](https://github.com/jan-bogaerts/md2/tree/main/design) | md²'s own cards, architecture notes, and release folders. |
| [`docs/`](../) | This documentation. |

`app` and `desktop` each have their own `package.json`; the root `package.json` wires up the common workflows.

## Prerequisites

- Node.js LTS and npm
- Git

## Install

```powershell
npm run install:all
```

## Run

```powershell
npm run dev
```

Starts the Vite dev server for `app` and, once it responds, launches the Electron shell against it. Run halves separately with `npm run dev:app` or `npm run dev:desktop`.

## Test and check

Each subproject is standalone:

```powershell
cd app
npm run lint
npm run typecheck
npm run test
```

```powershell
cd desktop
npm run lint
npm run test
```

Use `npm run typecheck` (`tsc --noEmit`) for type errors — `npm run build` also bundles and is slower for the same answer. Tests run under Vitest.

## Package

```powershell
npm run build:windows
```

Builds the React app, packages the Electron shell with electron-builder, and verifies the artifacts in `release/`. Signing configuration and the pre-release checklist are in [`desktop/packaging/BUILDING_WINDOWS.md`](https://github.com/jan-bogaerts/md2/blob/main/desktop/packaging/BUILDING_WINDOWS.md).

## Optional environment

`app/.env.example` and `desktop/.env.example` list optional Sentry and Aptabase keys for error reporting and usage counts. Copy to `.env` if you want them locally. Neither is required to build or run.

See also: [Architecture](architecture.md).
