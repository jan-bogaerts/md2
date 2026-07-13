---
id: F-031
title: config persistence
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

> **UPDATE 2026-07-11 — `connection.*` config removed.** The `connection` config source/section and its only entry `connection.githubScopes` were dropped along with GitHub OAuth (see [[F_034_github_oauth_cors_proxy]]). localStorage-persisted config is now `react.*` only; references to `connection.*` below are historical.

## Goal
Persist all config scopes, not only project values: React-app settings survive reloads via localStorage, desktop settings are written back to the desktop app (not just read from env vars), and every visible config entry actually has an effect.

## Current state
`ConfigService.saveDraft` applies values in memory and `ConfigPage` saves only the project scope through `dataService.saveProjectConfig()`. React-scoped values (`react.autoCommitDelayMs`, `react.showStartupSplash`) reset on every reload. Desktop values come from read-only env vars (`desktop/config.js` `resolveDesktopConfig`) with no writeback IPC, so editing `desktop.agent` in the UI is lost on restart — and the conversation-continue path in `preload.js` reads the env value directly, ignoring UI edits (see B-006). Two entries are dead: `react.showStartupSplash` and `connection.githubScopes` are editable but consumed by nothing.

## implementation details
- React scope: persist `react.*` (and `connection.*`) values to localStorage under a single key; `ConfigService.init` merges stored values over defaults; `saveDraft` writes them back.
- Desktop scope: replace env-only config with `electron-store` persistence (the store already exists for theme). Preload exposes `getDesktopConfig`/`setDesktopConfig`; `saveDraft` pushes desktop values through the bridge. Env vars remain as initial defaults on first run.
- Make desktop config the single source of truth for supported agent commands. The Electron action runner and conversation continuation resolve the same stored value; React never constructs the executable command.
- Wire up or remove the dead entries: `react.showStartupSplash` gates the `StartupSplash` rendering in `app.tsx`; `connection.githubScopes` feeds `readGithubAuthConfig`'s scopes (env value stays the fail-fast fallback) — or drop both entries if not wanted.
- Validation and draft flow stay as they are; only the persistence sinks change.

## acceptance criteria
- Changing `react.autoCommitDelayMs`, saving, and reloading the app keeps the new value and the commit batcher uses it.
- Changing `desktop.agent`, saving, and restarting the desktop app keeps the new value; both action runs and conversation continues use it.
- Every entry shown on `/config` demonstrably affects behavior (or has been removed).
- Web mode never touches the desktop bridge; desktop values are hidden there (unchanged).
- Tests cover localStorage round-trip, desktop bridge writeback, agent-command consistency and the splash/scopes wiring.

## see also
- `design\feature_descriptions\F_016_config.md`
- `design\architecture\initial description\config.md`
