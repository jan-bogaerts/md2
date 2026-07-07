---
id: J-001
title: initialize
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Create all folders and sub projects (React app, Electron app), install packages by running the install commands so we get the latest versions of everything. Result is a runnable skeleton app (React app starts, Electron app hosts it) that all features build on.

## Current state
Nothing is set up yet. The repo only contains `design/` docs, `README.md`, `LICENSE` and `.gitignore`. No sub-projects, no `package.json`, no tooling.

## implementation details
Two independent, standalone sub-projects in two plain folders at the repo root, each with its own `package.json` (no monorepo / workspaces):

- `app/` — the React SPA. This is the primary product: a pure static, client-only web app that must run standalone (deployed as a website). It has no knowledge of Electron.
  - Scaffold with Vite, React, TypeScript (`react-ts` template).
  - Add the UI packages by running their install commands (so we get the latest versions — do not hand-pin them): Material UI (`@mui/material` + emotion), `mdi-material-ui`, `react-diff-viewer-continued`, MDXEditor (`@mdxeditor/editor`) with plugins for lists, quotes, table, code blocks, links, images.
- `desktop/` — the Electron app. It hosts the React app but does **not** bundle it: it loads the React app from a **configurable URL** (env var / config setting with a sensible default).
  - Dev: point at the Vite dev server (e.g. `http://localhost:5173`).
  - Prod: point at the deployed website URL.
  - Scaffold a minimal Electron main process that opens a `BrowserWindow` and loads that URL. A `preload.js` stub is created as the future bridge (file-system access, agents, WebSocket "remote control") but no bridge logic is implemented in this job.

General:
- Install by running the package managers' install commands to pull latest versions; don't hand-write pinned versions.
- Add npm scripts so each project can be started (`app`: dev/build/preview; `desktop`: start).
- `.gitignore` covers `node_modules/`, build output (`dist/`) for both projects.

## acceptance criteria
- `app/` and `desktop/` exist as two standalone folders, each with its own `package.json` and lockfile.
- `cd app && npm install && npm run dev` starts the React SPA in a browser; `npm run build` produces static output in `app/dist`.
- The React app runs fully standalone in a browser with no Electron present.
- `cd desktop && npm install && npm start` opens an Electron window that loads the React app from the configured URL (pointing at the Vite dev server in dev).
- The URL the Electron app loads is configurable (env var / config), not hard-coded to a bundled copy, and no copy of the React app is included in the Electron build.
- The listed UI packages (MUI + `mdi-material-ui`, `react-diff-viewer-continued`, MDXEditor + the named plugins) are installed in `app/` at their latest versions.

## see also
- `design\architecture\initial description\components.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\desktop app.md`
