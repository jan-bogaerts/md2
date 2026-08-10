---
author: 
id: B_107
internalId: 8fedf475-d0af-4fe3-9aa0-d00bdfacffa0
title: Websocket agent selection
status: ready
owner: 
affects:
agents:
  - design/activity/card__8fedf475-d0af-4fe3-9aa0-d00bdfacffa0.json#conversation=agent-bc9a3885-7e22-4fc6-b6a5-7554c4e173e7
  - design/activity/card__8fedf475-d0af-4fe3-9aa0-d00bdfacffa0.json#conversation=agent-5fc641ba-c9e5-442c-a23a-4af037287a47
policy:
branch: b_107_websocket_agent_selection
worktree: 2
---

When connected through websockets (on mobile), the agent selectors are disabled. No way to set default agent config.

Also, the project config for the default agent settings is not shared over websocket, so on the action popup, the wrong agent settings are always used initially.

## Current state

Application startup loads desktop config only from Electron's synchronous `window.md2Config` preload bridge. A browser connected over WebSocket has no preload bridge, so `ConfigService` keeps built-in desktop defaults and reports desktop config unavailable. The Desktop config section is consequently disabled, and its save helper has no remote transport.

Remote project config already travels through `RemoteControlStorageService`, but agent, agent profiles, model, permission mode, and thinking level are desktop-global settings. They belong to the Electron host because that host starts agent processes; they must not move into repository project config.

Remote action execution and agent availability already use the WebSocket action bridge. Popup selectors are not inherently local-only, but they resolve initial values and available profile definitions from stale browser defaults. Custom host profiles and host default selections therefore cannot be selected reliably from a remote browser.

## implementation details

- Add authenticated WebSocket operations to load and save the Electron host's complete desktop config. Route them through `local_bridge_dispatch` to the existing desktop config store; no active project is required.
- Validate remote writes at the desktop boundary with the same field rules used by `ConfigService` before updating the store. Return the normalized persisted config only after the write succeeds.
- Add an async remote desktop-config transport instead of treating `window.md2Config` as available in a browser. During remote connection, load host config before activating the remote project and before agent controls consume defaults.
- Add a focused `ConfigService` operation that replaces desktop-sourced values, marks desktop config available, clears no project or React values, and emits its existing change event. Do not re-run full application initialization.
- Make config-page save await either local Electron persistence or remote WebSocket persistence. Apply the server-returned config, then reload agent availability so changed profiles and executable status match the host.
- On disconnect or failed initial load, mark remote desktop config unavailable. Keep agent controls disabled until host config and availability finish loading; report load or save failure through `dialogService` rather than running with browser defaults.
- Keep one desktop-global config shared by local and remote clients. Do not add agent fields to project config or persist them in the repository.
- Add config-service tests for replacing and clearing desktop values; remote storage request tests; desktop dispatcher validation and persistence tests; and config-page/action-selector tests for remote load, save, custom profiles, loading, and failure states.

## acceptance criteria

- After WebSocket connection, action popups initially show host desktop defaults for agent, model, permission mode, and thinking level.
- Remote selectors list host agent profiles and use host-reported executable availability.
- Remote user can change desktop agent defaults; Save waits for host acknowledgement, persists them in Electron's desktop config store, and subsequent local or remote loads return them.
- Agent controls remain disabled while host config or availability is loading. They become enabled after both loads succeed and no action run prevents editing.
- Failed config load or save shows a concrete error and never runs an action with browser fallback defaults or reports an unsaved change as saved.
- Remote config changes do not write agent settings into project config or repository files.
- Local Electron config editing and existing per-card action-setting persistence remain unchanged.
