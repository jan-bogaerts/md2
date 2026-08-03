---
author: 
id: B_87
internalId: 1b39ee56-e06e-4705-840f-7541b2a57d3d
title: Card changed not pushed to mobile
status: ready
owner: 
affects:
agents:
  - design/activity/card__1b39ee56-e06e-4705-840f-7541b2a57d3d.json#conversation=agent-6e7b30ea-5d5c-439b-b2b0-7f656fe5a400
  - design/activity/card__1b39ee56-e06e-4705-840f-7541b2a57d3d.json#conversation=agent-c6f98940-00b7-4041-a50e-fe0c85838b84
policy:
after: 
---

When an agent changes a card and the app is running in electron, the app gets updates and the card refreshed. This does not happen when app is on mobile and connected to electron.

We should verify if every message type is correctly implemented over websockets

## Current state

Electron's project watcher emits card changes through `watchProject`. Remote-control server forwards them as WebSocket `watchProject` events, and `RemoteControlStorageService` invokes registered callback. `ProjectLoading` then tries to reload changed markdown file, but stops because remote storage does not implement optional `loadFile`. Card therefore stays stale on mobile. Desktop storage implements `loadFile` through same dispatcher.

## implementation details

- Add `RemoteControlStorageService.loadFile` and proxy it through existing WebSocket request protocol. Server dispatcher already exposes method.
- Keep existing `watchProject` event and project reload flow; no separate card-change message needed.
- Add regression coverage for watch event followed by remote file load and refreshed project state.
- Audit all server-push message names and payloads against client handlers: `watchProject`, `agentRun`, `actionRun`, `codexRateLimits`, and `worktreesChanged`. Cover subscription setup and cleanup.

## acceptance criteria

- Agent change to card file appears on connected mobile app without reopening project.
- Added, changed, and removed markdown files received through `watchProject` update mobile project state.
- Remote `loadFile` returns same markdown payload and errors as Electron bridge.
- Every server-push message type has matching client handling and round-trip test coverage.
- Existing Electron project watching remains unchanged.
