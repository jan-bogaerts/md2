# Architecture

## Layers

```text
React UI (app/src/components)
        │  services only, no direct storage or process access
React services (app/src/services)
        │
data service ──────────────► storage service
                              ├── local Git (via Electron bridge)
                              ├── GitHub REST API
                              └── remote control (WebSocket to a desktop app)
        │
Electron host (desktop/src)
        ├── action runner (actions, agents, chaining, scheduling)
        ├── Git and worktrees
        └── remote-control server
```

## Data layer

The **data service** offers generic operations — open project, read and write files, card operations, release archiving — split by scope (project, file, card).

Underneath, a **storage service** implements those operations for one backend: `local_git_storage_service` (desktop), `github_storage_service` (web), `remote_control_storage_service` (browser attached to a desktop app). The UI never knows which one is active; it asks the data service. Capability differences are exposed as optional storage methods, which is why worktree calls fail with "requires Electron local mode" rather than silently doing nothing.

## Rule: the renderer never executes

The React side sends an action `id`, a context, and run-specific input. Electron reloads the persisted definition, validates it, resolves linked ids and placeholders, and runs the chain. Commands, prompts, and chain definitions never travel from renderer to host as executable data.

This holds for the remote-control bridge too: a remote client is just another renderer, so the same validation applies to whatever it sends.

## Bridges

Two paths from the React app into Electron:

- **preload** (`desktop/src/shell/preload.js`) — context-isolated IPC over named channels (`md2-local-bridge:*`, `md2-config:*`, `md2-remote-control:*`, `md2-theme:*`, `md2-lifecycle:*`).
- **WebSocket** (`desktop/src/integrations/remote_control_service.js`) — the same request set, token-gated, plus static hosting of the built React app on the same port.

Both funnel into the same dispatch layer, so a capability added for one is available to the other.

## Services and events

Services are singletons that own state and publish events; components subscribe rather than polling. Notable ones:

| Service | Owns |
| --- | --- |
| `project_session_service` | Open project, branch, load and reload |
| `open_files_service` | Open documents and the active document, by object reference |
| `action_service` | Loaded action definitions; source of truth for display |
| `action_execution_service` | Live run state shared by popup, card, and conversation panel |
| `agent_conversation_service` | Persisted transcripts and provider sessions |
| `worktree_service` | Registered worktrees, card assignments, status |
| `config_service` | Merged React, project, and desktop configuration |

Editors read Markdown through a `dataSource` interface and refresh on service events instead of prop changes, so a card and its action tabs can share one document without fighting over state.

## Shared code

Anything both sides must agree on lives in `shared/`: action definition validation, agent profiles, conversation and activity file paths, usage math. Parity tests keep the React and Electron sides on the same rules.

## Where the design lives

[`design/architecture/`](../../design/architecture/) holds the architecture notes and the original description; [`design/releases/`](../../design/releases/) holds the per-release card folders. They record intent and history — this page describes the code as it stands.

See also: [Development setup](development-setup.md), [Release process](release-process.md).
