---
author: 
id: F_222
internalId: a2f851ba-744e-4b53-bc9b-33e1eaa6787a
title: Claude account usage missing on small screen
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__a2f851ba-744e-4b53-bc9b-33e1eaa6787a.json
policy:
after: 2740ca78-6f46-4297-8adb-ee047283f48d
---
first noticed while on connected through websocket to electron with using an android (small screen), claude account usage was not on the hamburger menu. But when connected over websockets using a browser, so large screen, but still remote, claude-account-usage is also missing on the status bar, yet in the electron environment (so react in electron renderer), is showing claude-account-status. so something is not transmitted over websockets perhaps?

## Current state

`ClaudeRateLimitStatus` is already mounted in both relevant surfaces: `MobileProjectStatus` in the small-screen hamburger drawer and `StatusBar` on larger screens. It renders nothing until `ClaudeRateLimitService` receives a current Claude usage snapshot.

The local Electron renderer receives that snapshot through `window.md2ClaudeRuntime`. A remote browser instead uses `RemoteControlStorageService` as its runtime bridge. Remote connection activation installs and starts the Codex runtime bridge, but does neither for Claude. The WebSocket client and server also implement Codex snapshot reads, live subscriptions, cleanup, and reconnection restoration only. Claude polling and desktop snapshot storage work; missing WebSocket transport leaves the remote renderer without Claude data, regardless of screen size.

## implementation details

- Make `RemoteControlStorageService` implement `ElectronClaudeRuntimeBridge` beside its existing Codex bridge. Add `getClaudeRateLimits()` plus Claude listener, pending-request, and subscription state. A **runtime bridge** is the renderer-facing API that reads the latest desktop snapshot and subscribes to later snapshots.
- Add `onClaudeRateLimits` to the WebSocket push protocol. `RemoteControlService` must subscribe through `local_bridge_dispatch`, send `claudeRateLimits` events with request and subscription identifiers, and dispose each desktop subscription when the browser unsubscribes or disconnects.
- Route Claude push events to the matching client callback. Restore active Claude subscriptions after WebSocket reconnection, and clear Claude callback, request, and subscription bookkeeping when the socket closes.
- During remote activation, install `RemoteControlStorageService` with `setClaudeRuntimeBridgeOverride` and start `claudeRateLimitService`. Clear the override when remote activation ends. Keep local Electron activation unchanged.
- Reuse existing `ClaudeRateLimitService`, `ClaudeRateLimitStatus`, detail surface, validation, stale-state timing, and desktop/mobile placement. Do not change Claude polling, snapshot shape, visibility rules, or Codex behavior.
- Extend remote-control server, remote storage, and connection lifecycle tests with Claude snapshot reads, push routing, unsubscribe cleanup, socket-close cleanup, and reconnection restoration. Existing component tests remain the UI contract because both surfaces already use the same Claude status component.

## acceptance criteria

- After a remote browser connects, it reads the desktop's latest Claude rate-limit snapshot and subscribes to later snapshots through the WebSocket bridge.
- When a current Claude snapshot exists, a large remote browser shows `Claude N% used` in the status bar and a small-screen remote browser shows `Claude usage` in the hamburger drawer's **Project status** section.
- Claude detail content, warning/error styling, and stale or unavailable hiding match the local Electron renderer because both connection modes use the existing Claude renderer service and components.
- A Claude snapshot published after connection updates the visible remote value without reload.
- After an unexpected WebSocket close, old Claude data becomes untrusted; after reconnection, the remote renderer reads the current snapshot and restores one live Claude subscription without duplicate events.
- Unsubscribing, disconnecting, or replacing a remote connection removes its desktop Claude subscription and client-side callback state.
- Codex rate-limit transport, Claude polling, local Electron Claude display, desktop/mobile layout, and hamburger behavior remain unchanged.
- Focused remote-control and connection lifecycle tests pass, and app lint and unit tests pass.
