---
internalId: 03921a57-595a-49ec-92d2-07a09e3ac66f
---

# CODEMAP

Navigation map for an AI coding agent. Assumes you know Electron/React/TS. Only documents what is specific to this repo. All paths repo-relative.

## Repo shape (npm workspaces-by-convention, not actual workspaces)

Three source roots, each its own `package.json`, wired by relative imports (no monorepo tooling, no path aliases except one MUI shim):

- [app/](../app/) — Vite + React 19 renderer (TypeScript, ESM). This is the whole UI. Runs in Electron **and** unchanged in a plain browser (remote-control / mobile).
- [desktop/](../desktop/) — Electron host shell (plain CommonJS `.js`, no TS, no bundler). Main process + preload + Node services.
- [shared/](../shared/) — Raw `.mjs` modules with `.d.mts` sidecar types, imported by **both** app and desktop via relative paths (`../../../shared/x.mjs`). No build, no copy, no symlink. See gotchas.
- [design/](../design/) — Spec docs. `feature_descriptions/ready/F_*.md`, `B_*.md`, `J_*.md` are the feature/bug/refactor backlog; `architecture/` holds the living model docs. `design/actions/*.md` are runtime action-definition examples, not docs.
- Root [package.json](../package.json) — orchestration only: `npm run dev` runs app (vite :5173) + desktop concurrently; `npm run install:all`; `npm run build:windows`.

## Entry points

- Main process bootstrap: [desktop/main.js](../desktop/main.js) (`app.whenReady` at :319 registers all IPC bridges then `createWindow`). Launched via [desktop/start_electron.js](../desktop/start_electron.js).
- Preload: [desktop/src/shell/preload.js](../desktop/src/shell/preload.js) — set in `webPreferences.preload` at [main.js:219](../desktop/main.js#L219). `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
- Renderer mount: [app/src/main.tsx](../app/src/main.tsx). **`import './prism_bootstrap'` must stay line 1** (publishes `Prism` global before language chunks evaluate).
- Renderer root component: [app/src/app.tsx](../app/src/app.tsx).

## Process boundary & IPC

The renderer never sees Electron. Preload exposes seven `window.md2*` objects via `contextBridge`. Almost all real work funnels through **one** generic RPC channel; the rest are small dedicated channels.

### The local bridge (the important part)

`window.md2Data` and `window.md2Actions` are **method proxies**, not per-method channels. Method lists live in [preload.js:19-61](../desktop/src/shell/preload.js#L19) (`DATA_METHODS`, `ACTION_METHODS`). Every call is serialized as `{ eventId, method, params }` over a single channel and dispatched by name in the main process.

- Channel names: [desktop/src/shell/ipc_channels.js](../desktop/src/shell/ipc_channels.js) (also duplicated literally in preload.js — keep in sync).
- Dispatch table (method name → Node service call): [desktop/src/shell/local_bridge_dispatch.js](../desktop/src/shell/local_bridge_dispatch.js). `dataBridge` and `actionBridge` objects define every method. Holds `currentLocalProject` as mutable module state.
- Main-side wiring: `registerLocalBridge()` at [main.js:131](../desktop/main.js#L131).

| Channel | Direction | Payload | Defined in |
|---|---|---|---|
| `md2-local-bridge:invoke` | R→M (invoke/handle) | `{eventId, method, params[]}` → method result | preload `invokeBridge`, main [:132](../desktop/main.js#L132) |
| `md2-local-bridge:subscribe` | R→M (send) | `{method, params, subscriptionId}` | main [:142](../desktop/main.js#L142) |
| `md2-local-bridge:unsubscribe` | R→M (send) | `subscriptionId` | main [:155](../desktop/main.js#L155) |
| `md2-local-bridge:event` | M→R (send) | `{eventId, payload}` — streamed/subscription data | preload listeners |

- **Streaming methods** (agent output): listed in `EVENT_METHODS` (`runSearchRegexpAgent`, `startAgentConversation`) — last param is a callback; main re-sends chunks on the `:event` channel keyed by `eventId`.
- **Subscriptions** (long-lived): `SUBSCRIPTION_METHODS` = `onActionExecution`, `watchProject`. Cleanup tracked in `subscriptionCleanups` map, auto-removed on `webContents 'destroyed'`.

### Dedicated channels

| Channel(s) | Direction | Purpose | `window.*` | Main handler |
|---|---|---|---|---|
| `md2-config:get-desktop` / `:set-desktop` | R↔M | desktop agent config (electron-store) | `md2Config` | `registerConfigBridge` [:160](../desktop/main.js#L160) |
| `md2-theme:set-mode` | R→M | persist theme, sync `nativeTheme` + titlebar overlay | `md2Theme` | `registerThemeBridge` [:187](../desktop/main.js#L187) |
| `md2-lifecycle:flush-pending-commits` / `-done` | M↔R | on quit, main asks renderer to flush unsaved commits (5s timeout, 10s watchdog) | `md2Lifecycle` | [:278](../desktop/main.js#L278) |
| `md2-remote-control:start`/`stop`/`get-status`/`status` | R↔M | run/stop the LAN web server; `status` is M→R broadcast | `md2RemoteControl` | `registerRemoteControlBridge` [:177](../desktop/main.js#L177) |
| `md2-remarkable:test-connection`/`list-image-files`/`import-files` | R→M | reMarkable tablet SSH import | `md2Remarkable` | `registerRemarkableBridge` [:171](../desktop/main.js#L171) |

### Bridge security (don't weaken casually)

- Preload refuses to expose anything unless `isAllowedOrigin()` passes ([preload.js:150](../desktop/src/shell/preload.js#L150)). Allowed origins + trusted location are passed as `--md2-*` `additionalArguments` in [main.js:214](../desktop/main.js#L214). Origins resolved in [desktop/src/shell/config.js](../desktop/src/shell/config.js) `resolveBridgeAllowedOrigins`.
- Navigation guards (`will-navigate`, `setWindowOpenHandler`): [desktop/src/shell/renderer_security.js](../desktop/src/shell/renderer_security.js). External links go to system browser; everything else denied.

## Storage backends — the core renderer abstraction

The renderer talks to a single `StorageService` interface (defined in [app/src/data/data_types.ts](../app/src/data/data_types.ts)). Three implementations, one chosen at project-open time by `StorageType = 'github' | 'local' | 'remote'`:

- Factory: [app/src/data/project_session.ts](../app/src/data/project_session.ts) `createStorageService` (:43). Also persists last project to `localStorage['md2.lastProject']`.
- `local` → [app/src/services/data/local_git_storage_service.ts](../app/src/services/data/local_git_storage_service.ts) → calls `window.md2Data.*` → local bridge → [desktop/src/git/local_git_service.js](../desktop/src/git/local_git_service.js) (git via shelling out).
- `github` → [app/src/services/github/github_storage_service.ts](../app/src/services/github/github_storage_service.ts) (+ 8 sibling `github_storage_*` files: context/loader/writer/normalizers/gitData). Talks to GitHub REST directly from the browser. No desktop involved.
- `remote` → [app/src/services/data/remote_control_storage_service.ts](../app/src/services/data/remote_control_storage_service.ts). A WebSocket client that re-implements the same bridge RPC over WS to a desktop running the remote-control server. Used when the renderer runs in a phone browser.
- Backend swap side-effects (action bridge + agent capabilities): [app/src/data/project_storage_activation.ts](../app/src/data/project_storage_activation.ts). Remote mode also becomes the action bridge via `setActionBridgeOverride`.

### Remote control (mobile) topology

- Desktop server: [desktop/src/integrations/remote_control_service.js](../desktop/src/integrations/remote_control_service.js) — a Node `http` + `ws` server. Serves the **built** renderer statically (dir from `resolveRendererStaticDir`, [renderer_security.js:22](../desktop/src/shell/renderer_security.js#L22) = `app/dist` in dev) and proxies bridge RPC over WS with a token. Filters virtual/VM network adapters when advertising LAN IPs (`VIRTUAL_ADAPTER_PATTERN`).
- Renderer connection settings persisted in `localStorage` (`md2.remoteControl.endpoint`/`.token`): [app/src/data/remote_control_connection.ts](../app/src/data/remote_control_connection.ts).
- Connect UI: [app/src/components/shell/remote_connect_button.tsx](../app/src/components/shell/remote_connect_button.tsx), `remote_connect_dialog.tsx`, `remote_control_button.tsx`.

## State management

No Redux/Zustand/Context-store. Pattern is **plain singleton service classes** + a hand-rolled subscribe/`useSyncExternalStore`-style hook layer.

- Service registry: [app/src/services/service_injector.ts](../app/src/services/service_injector.ts) — a `Map<string,unknown>` with `register()`/`getService()`. Services self-register at module load.
- Central store: [app/src/services/data/data_service.ts](../app/src/services/data/data_service.ts) owns `DataServiceState` (project, snapshot, running agents, save state). Delegates to collaborators: `ProjectState`, `ProjectLoading`, `CardOperations`, `AgentIntegration`, `ReleaseOperations`, `SaveStateService` (all in `services/project/` and `services/data/`).
- Loaded-project state object: [app/src/services/project/project_state.ts](../app/src/services/project/project_state.ts) (files, snapshot, card cache, load tokens for staleness).
- React binding: hooks in [app/src/components/hooks/](../app/src/components/hooks/) (`use_project_state.ts`, `use_action_executions.ts`, `use_config_value.ts`, …) subscribe to services.
- Config: [app/src/services/config/config_service.ts](../app/src/services/config/config_service.ts). **Project** config persists to the repo (`md2.config.json`); **desktop** config (agent choice/model) persists via electron-store through `md2Config`.
- Commit batching: [app/src/data/commit_batcher.ts](../app/src/data/commit_batcher.ts) debounces edits into git commits (`AUTO_COMMIT_DELAY_MS`). This is why quit needs the lifecycle-flush handshake.

## Actions & agents subsystem (largest domain)

"Actions" = user-defined agent/command workflows stored as markdown definitions in the project. "Agents" = external CLIs (codex, claude) shelled out by the desktop.

- Desktop execution engine: [desktop/src/actions/](../desktop/src/actions/) — `action_runner_service.js` (orchestrator), `action_agent_executor.js`, `action_command_executor.js`, `action_scheduler_service.js` (timers), `agent_runner_service.js`, `agent_provider_protocol.js` (normalizes codex vs claude JSON stream: usage tokens, file-change tracking, session resume). Agent profiles/commands: [desktop/src/actions/agent_profiles.mjs](../desktop/src/actions/agent_profiles.mjs).
- Renderer side: [app/src/services/actions/](../app/src/services/actions/) + [app/src/services/agents/](../app/src/services/agents/). Action UI: [app/src/components/actions/](../app/src/components/actions/) (~60 files; `action_editor.tsx`, `action_popup.tsx` are the hubs).
- Worktree isolation for actions: [desktop/src/git/worktree_service.js](../desktop/src/git/worktree_service.js) + `action_worktree_execution_service.js`. Git owns linked-worktree discovery and lifecycle.

## UI structure

Renderer components in [app/src/components/](../app/src/components/), grouped by surface, not by type:

- `shell/` — window chrome, toolbar, status bar, remote-control + theme controls, `main_window.tsx`.
- `card_view/` — the kanban/card board (dnd-kit based, `card_view.tsx`, `card_drag.ts`).
- `text_view/` — file-tree + tabbed document view.
- `editor/` — markdown editor built on **@mdxeditor/editor + Lexical** (`markdown_editor.tsx`); custom `{{placeholder}}` typeahead plugins.
- `actions/`, `agents/`, `config/` — as above.

## Build / dev / package

- Renderer bundler: **Vite 8 (rolldown-based)**. Config: [app/vite.config.ts](../app/vite.config.ts). Dev: `npm run dev:app` (:5173). Build: `cd app && npm run build` (`tsc && vite build` → `app/dist`).
- Typecheck: `cd app && npm run typecheck` (`tsc --noEmit`). **Use this, not `npm run build`, to check types.**
- Tests: **Vitest** in all three roots. Renderer uses `pool: 'threads'` (forks pool crashes under rolldown-vite — see vite.config.ts note). Test setup: `app/src/test/setup.ts`.
- Desktop is **not bundled** — plain CJS run directly by Electron.
- Packaging: `npm run build:windows` → [desktop/build_windows.js](../desktop/packaging/build_windows.js). electron-builder config: [desktop/electron-builder.config.cjs](../desktop/electron-builder.config.cjs) → [desktop/packaging/builder_config.js](../desktop/packaging/builder_config.js). Post-package verification: `packaging/verify_windows_package.mjs` + Authenticode `verify_authenticode.ps1`. NSIS, x64, signed. See [desktop/packaging/BUILDING_WINDOWS.md](../desktop/packaging/BUILDING_WINDOWS.md).
- Telemetry: Sentry + Aptabase, both processes (`@sentry/electron` + `@sentry/react`, `@aptabase/*`). Renderer: `services/telemetry/`; desktop: `integrations/telemetry.js`.

## Naming & organization conventions actually followed

- Files: `snake_case` everywhere (`.ts`, `.tsx`, `.js`, `.mjs`), including React components (`card_view.tsx` not `CardView.tsx`). Exported React component/class names stay PascalCase.
- Tests colocated next to source: `x.test.ts(x)` for renderer, `x.test.mjs` for desktop.
- Services are classes with a matching `_service` suffix, registered by string name in `service_injector`.
- One responsibility per file, aggressively split (see `github_storage_*`, `services/project/*`, the `J_*` refactor docs). Prefer adding a collaborator over growing a file.
- Comments explain **why**, are sparse, often reference a feature id (`F-045`, `B_030`) tying code to `design/feature_descriptions/`.
- Cross-cutting pure logic that both processes need goes in `shared/*.mjs` (validation, path utils, agent profiles, usage math).

## Gotchas / don't-touch

- **`shared/*.mjs` is required by desktop CJS** (`require('../../../shared/x.mjs')`) and imported by app ESM. Relies on Node's `require(ESM)` support. No build step converts it — edit the `.mjs` and the `.d.mts` sidecar together.
- **Channel names are duplicated** in `ipc_channels.js` and `preload.js` (preload is sandboxed and can't import the shared module cleanly). Change both.
- **`main.tsx` line 1 prism import** and **`vite.config.ts` `define: {global:'globalThis'}`** are both load-order hacks for prismjs-via-Lexical. Removing either breaks the built app only (not dev). See F-045 note in vite.config.ts.
- **`local_bridge_dispatch.js` keeps `currentLocalProject` as mutable state**; many methods depend on a prior `loadProject`/`resolveProject` having set it. Order-sensitive.
- **Quit is intercepted** (`before-quit` → `preventDefault` → `stopAndQuit`, [main.js:341](../desktop/main.js#L341)) to flush renderer commits and telemetry, guarded by a 10s force-exit watchdog. Don't add blocking work to shutdown without honoring the watchdog.
- Vitest **`pool: 'threads'` is deliberate** — do not switch to forks.
- `commit_batcher.ts` starts with a UTF-8 BOM (`﻿`) — preserved intentionally; don't strip on edit.
- Desktop reads `.env` at startup ([main.js:6](../desktop/main.js#L6)); packaged path differs (`process.resourcesPath`).
