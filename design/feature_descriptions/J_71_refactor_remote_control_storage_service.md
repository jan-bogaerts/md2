---
author: 
id: J_71
internalId: 6848789c-38d0-479c-ad68-4da42008eefa
title: refactor remote control storage service
status: ready
owner: 
affects:
agents:
  - design/activity/card__6848789c-38d0-479c-ad68-4da42008eefa.json
policy:
after: a1bb555a-bf8b-4111-a211-23e18445fe00
changedFiles:
  - app/src/services/data/remote_connection_service.ts
  - app/src/services/data/remote_control_action_bridge.node.test.ts
  - app/src/services/data/remote_control_action_bridge.ts
  - app/src/services/data/remote_control_broadcast_subscription.node.test.ts
  - app/src/services/data/remote_control_broadcast_subscription.ts
  - app/src/services/data/remote_control_callback_subscription.node.test.ts
  - app/src/services/data/remote_control_callback_subscription.ts
  - app/src/services/data/remote_control_claude_runtime_bridge.node.test.ts
  - app/src/services/data/remote_control_claude_runtime_bridge.ts
  - app/src/services/data/remote_control_client.node.test.ts
  - app/src/services/data/remote_control_client.ts
  - app/src/services/data/remote_control_codex_runtime_bridge.node.test.ts
  - app/src/services/data/remote_control_codex_runtime_bridge.ts
  - app/src/services/data/remote_control_connection_error.ts
  - app/src/services/data/remote_control_desktop_config_transport.node.test.ts
  - app/src/services/data/remote_control_desktop_config_transport.ts
  - app/src/services/data/remote_control_project_watch.node.test.ts
  - app/src/services/data/remote_control_project_watch.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/src/services/data/remote_control_subscription_failure.ts
  - app/src/services/test_support/mock_web_socket.ts
---

`app/src/services/data/remote_control_storage_service.ts` is approximately 1,430 lines and combines WebSocket transport, RPC correlation, reconnection, remote subscriptions, event routing, pending-push tracking, and five public service contracts. Split it into focused units without changing the remote-control protocol or established application behavior.

## Current state

`RemoteControlStorageService` currently implements all of the following:

* `StorageService`
* `ElectronActionBridge`
* `ElectronCodexRuntimeBridge`
* `ElectronClaudeRuntimeBridge`
* `DesktopConfigTransport`

The same class also owns endpoint initialization, socket creation, request IDs, pending request resolution, remote error rehydration, reconnect waiting, retirement, connection notifications, best-effort unsubscribe requests, persistent subscription restoration, agent-run event routing, project watches, model-catalog events, worktree events, and local pending-push state.

The main direct consumers are:

* `project_session.ts`, which creates the remote storage selected by the project source.
* `project_storage_activation.ts`, which verifies that remote storage is a `RemoteControlStorageService` before passing it to `RemoteConnectionService`.
* `remote_connection_service.ts`, which owns connection attempts and installs the action, runtime, and desktop-config bridge overrides.
* `remote_connect_button.tsx`, which asks the connected storage for the active desktop project.
* `project_session_service.ts` and related tests, which use or mock remote-specific methods.

Most remaining consumers receive one of the declared interfaces through an existing override or through `StorageService`; they do not need the aggregate class.

The existing `remote_control_storage_service.node.test.ts` is approximately 1,600 lines. It mixes transport, reconnection, subscription, protocol forwarding, pending-push, bridge, and error behavior.

## Required architecture

### Remote-control client

Add `remote_control_client.ts` with a `RemoteControlClient` class. It owns only protocol transport and connection lifecycle:

* endpoint initialization and validation;
* socket creation, connection, explicit disconnection, and retirement;
* the shared reconnect waiter;
* monotonically increasing request IDs;
* JSON request serialization;
* pending request correlation by request ID;
* response success and failure handling;
* `BridgeErrorPayload` rehydration and remote-method context;
* rejection of in-flight requests when the active socket closes;
* ignoring messages, close events, and error events from superseded sockets;
* best-effort `unsubscribe` requests; and
* connection notifications through `EventTarget`.

The client must expose a small internal API sufficient for ordinary requests and subscription setup. It must allow subscription code to associate an outgoing request ID before an event can arrive. Do not expose its socket or pending-request map to domain adapters.

Move `RemoteControlConnectionError` and `isRemoteControlConnectionError` to `remote_control_connection_error.ts`. Update all existing imports rather than re-exporting a compatibility alias from `remote_control_storage_service.ts`.

### Remote subscriptions

The protocol has three different subscription lifecycles. Keep those differences explicit rather than adding behavior flags to one large manager.

1. Add `remote_control_callback_subscription.ts` for one local listener backed by one server subscription. Use it for action-run, conversation-viewed, Codex-rate-limit, Claude-rate-limit, and merge-conflict events. Each subscription owns its request ID, server subscription ID, active state, restoration, and cleanup. Protocol routing maps may map request and subscription IDs to subscription objects; they must not act as listener registries.
2. Add `remote_control_broadcast_subscription.ts` for one server subscription shared by multiple local listeners. Use `EventTarget` for model-catalog and worktree-state listeners. Subscribe on the first local listener, unsubscribe after the last listener, and restore one server subscription after reconnect.
3. Add `remote_control_project_watch.ts` for one watched project. It owns the project reference, change/error/restored events, setup state, server subscription ID, reconnect restoration, and cleanup during asynchronous setup.

Add `remote_control_subscription_router.ts` only if one router is required to dispatch incoming protocol events to these subscription objects. It may map protocol request IDs and server subscription IDs to active subscription objects. It must not own domain callbacks or duplicate the subscription state.

Use `EventTarget`, `addEventListener`, `removeEventListener`, and `dispatchEvent` for local notifications. Remove the current hand-written callback `Set`s and custom listener iteration. A collection of active subscription objects is lifecycle state, not a listener registry.

Keep request-scoped agent-run streaming separate from persistent subscriptions. Add `remote_control_agent_run_router.ts` only if extracting that request-ID/run-ID routing materially simplifies the client or action bridge.

### Public adapters

Keep `RemoteControlStorageService` as the project-storage object returned by `createStorageService()`. It owns the shared `RemoteControlClient`, implements `StorageService`, retains pending-push state, and exposes remote-specific connection lifecycle and `getActiveProject()`.

Move the other public contracts into composed adapters that share the same client:

* `remote_control_action_bridge.ts` implements `ElectronActionBridge`.
* `remote_control_codex_runtime_bridge.ts` implements `ElectronCodexRuntimeBridge`.
* `remote_control_claude_runtime_bridge.ts` implements `ElectronClaudeRuntimeBridge`.
* `remote_control_desktop_config_transport.ts` implements `DesktopConfigTransport`.

Expose these adapter instances as readonly properties of `RemoteControlStorageService`. Do not make the adapters global singletons; every remote storage instance must keep an isolated client, subscriptions, pending requests, and connection lifecycle.

Update `activateRemoteStorage()` in `remote_connection_service.ts` to install the composed adapters instead of installing the storage object for every bridge:

```typescript
setActionBridgeOverride(storage.actionBridge);
setClaudeRuntimeBridgeOverride(storage.claudeRuntimeBridge);
setCodexRuntimeBridgeOverride(storage.codexRuntimeBridge);
setDesktopConfigTransportOverride(storage.desktopConfigTransport);
```

Keep the existing `RemoteControlStorageService` type check and project-storage flow. Generic storage consumers must continue receiving the same `StorageService` object.

## Storage behavior

Move only `StorageService` operations and related pending-push tracking into the reduced `remote_control_storage_service.ts`. Preserve these established details:

* `commit`, file and folder deletion, moves, worktree integration, primary commits, and project-config saves mark the affected branch as having a pending push.
* A successful primary `push` clears the affected branch.
* `writeFiles` does not mark a pending push.
* `loadPendingPush` replaces the cached state for the requested branch with the host result.
* `loadAgentConversation` and `loadActivityConversations` continue sending only the path because that is the current remote protocol.
* `listRepositories` continues returning an empty array after initialization without making a remote request.
* Optional `loadProject` root exclusion remains omitted from `params` when it is `undefined`.
* Remote method names and parameter order remain byte-for-byte compatible with `desktop/src/integrations/remote_control_service.js` and `desktop/src/shell/local_bridge_dispatch.js`.

Do not change the branch-only pending-push key in this job. Local Git storage uses the same behavior, so changing it requires separate analysis of both implementations and all consumers.

## Connection and request behavior

Preserve the following behavior in `RemoteControlClient`:

* Concurrent responses resolve the request with the matching ID regardless of response order.
* Requests made while reconnecting wait for the shared socket attempt.
* Requests already sent when a connection closes fail once and are not replayed.
* A retired storage rejects new requests without creating a socket.
* Explicit disconnect and retirement reject reconnect waiters with the current `RemoteControlConnectionError` messages.
* Only the current socket may change connection state or deliver messages.
* Connection listeners receive `true` after the current socket opens and `false` when it closes.
* Known bridge errors retain their typed cause. Other remote failures retain the `Remote method <method> failed:` prefix, error code, fields, and cause.
* Subscription restoration begins only after the replacement socket opens. A failed restoration must not fail the connection itself.

Do not add request replay, retry counts, compatibility modes, protocol fallbacks, or alternate payload shapes.

## Subscription behavior

Preserve all subscription guarantees:

* Events received before the subscription response can route through the setup request ID.
* Events received after setup route through the server subscription ID.
* Cleanup before setup completes sends a best-effort unsubscribe after the server returns the subscription ID.
* Disconnect clears server-specific routing while retaining active local subscriptions for restoration.
* Reconnect restores every active subscription exactly once.
* Stopped subscriptions are not restored.
* A project watch calls `onRestored` only after a replacement server subscription is established.
* Project-watch error notifications continue to call `onError` without being delivered as change events.
* Model-catalog and worktree-state listeners share one server subscription per stream.
* Agent-run events continue routing by setup request ID and, where provided by the protocol, by run ID until the closed event.

## Required defect correction

`closeSocket()` currently clears the other persistent subscription maps but omits `conversationViewedCallbacks`, `conversationViewedSubscriptions`, and `requestConversationViewedEvents`. A disconnect during conversation-view subscription setup can therefore leave a stale pending entry that prevents restoration.

Add a regression test and correct this omission as part of the subscription extraction. After disconnect, conversation-view routing must contain no server-specific state, while the active local subscription remains eligible for exactly one restoration. This is the only intentional behavior correction in this job.

## Implementation sequence

1. Add characterization tests for current request, connection, adapter, pending-push, and subscription behavior before moving implementation.
2. Add the conversation-view reconnect regression test and confirm that it fails for the cleanup omission.
3. Extract `remote_control_connection_error.ts` and update every consumer import.
4. Extract `RemoteControlClient` while keeping the existing service public API operational.
5. Extract the three subscription lifecycle units and route incoming events through them.
6. Fix conversation-view disconnect cleanup through the new subscription lifecycle.
7. Extract the action, Codex runtime, Claude runtime, and desktop-config adapters.
8. Update `remote_connection_service.ts` to install the composed adapters.
9. Reduce `RemoteControlStorageService` to storage operations, pending-push state, the client composition root, remote connection lifecycle, `getActiveProject()`, and readonly adapter exposure.
10. Split the existing test file by production boundary.
11. Move all imports to the top of their files, initialize class fields at declaration where this improves readability, order members by responsibility, and normalize semicolon usage in touched code.
12. Run focused tests, app type checking, and app lint. Do not run the full test suite unless separately requested.

Each step must leave focused tests passing. Do not combine extraction with protocol renaming or unrelated behavior changes.

## Test organization

Create focused test files close to the code they verify:

* `remote_control_client.node.test.ts`: request correlation, initialization, connection, reconnect waiting, disconnect, retirement, stale sockets, response errors, and in-flight rejection.
* `remote_control_callback_subscription.node.test.ts`: request-ID routing, subscription-ID routing, early cleanup, unsubscribe, disconnect, and exactly-once restoration.
* `remote_control_broadcast_subscription.node.test.ts`: first/last listener behavior, fan-out, reconnect restoration, and cleanup during setup.
* `remote_control_project_watch.node.test.ts`: change, error, restored, stopped-watch, setup-race, and reconnect behavior.
* `remote_control_storage_service.node.test.ts`: `StorageService` method names and parameters, pending-push behavior, optional parameters, and remote-specific project lookup.
* `remote_control_action_bridge.node.test.ts`: action methods, action events, agent-run streaming, schedules, history, activity, and diff operations.
* Runtime and desktop-config adapter tests: rate-limit requests and events, model catalog behavior where owned, and configuration load/save.

Reuse one `MockWebSocket` test helper in a dedicated test-support module. It may model socket state and sent/received messages, but it must not contain assertions or production behavior.

Update integration tests that currently spy on action, runtime, or config methods through `RemoteControlStorageService.prototype` to use the relevant adapter or override boundary. Keep storage and connection tests on `RemoteControlStorageService`.

## Affected call sites

Review and update all verified direct imports or prototype references, including:

* `app/src/data/project_session.ts`
* `app/src/data/project_storage_activation.ts`
* `app/src/services/data/remote_connection_service.ts`
* `app/src/services/project/project_session_service.ts`
* `app/src/components/shell/remote_connect_button.tsx`
* `app/src/services/application_startup_service.ts`
* `app/src/services/actions/action_prompt_draft_service.ts`
* `app/src/components/actions/run/popup/action_popup_defaults.ts`
* tests importing `RemoteControlConnectionError` or spying on `RemoteControlStorageService.prototype`

The first five should keep their current storage and connection behavior. Error consumers should import the extracted error module. Bridge consumers should continue using the existing override getters and require no feature-level changes.

## Out of scope

* Desktop-side protocol or dispatch refactoring.
* Renaming remote methods or events.
* Changing request or event payloads.
* Automatic request replay or retry policy.
* Changing project, card, conversation, or run identity.
* Changing pending-push semantics beyond preserving current behavior.
* Replacing `RemoteConnectionService` or moving its retry/backoff policy into the client.
* Adding compatibility exports, feature flags, fallback payloads, or legacy branches.

## Acceptance criteria

* `remote_control_storage_service.ts` implements `StorageService` but no longer implements the action, Codex runtime, Claude runtime, or desktop-config contracts directly.
* One `RemoteControlClient` owns socket and RPC state for each remote storage instance.
* The action, Codex runtime, Claude runtime, and desktop-config adapters share that client and are exposed as readonly properties of the storage service.
* `RemoteConnectionService` installs the composed adapters through the existing override functions.
* No domain adapter reads or mutates the client's socket or pending-request map.
* Local notifications use `EventTarget`; no callback `Set` or custom listener registry remains.
* Active persistent subscriptions restore exactly once after reconnect, stopped subscriptions do not restore, and cleanup during setup unsubscribes the eventual server subscription.
* Conversation-view subscription state is cleared and restored consistently with action-run subscriptions.
* Existing RPC method names, parameter order, results, typed errors, connection messages, pending-push behavior, and project-loading behavior remain unchanged except for the documented conversation-view correction.
* Remote storage instances remain isolated and cannot share sockets, request IDs, subscriptions, pending requests, or pending-push state.
* The original mixed test file is split by responsibility and no replacement test starts Git, desktop processes, servers, shells, or other external programs.
* Focused tests, app type checking, and app lint pass.
