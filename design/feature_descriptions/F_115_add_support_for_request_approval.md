---
author: 
id: F_115
internalId: 7bdf27fc-963c-4545-83e2-93410e67f0e3
title: add support for request approval
status: ready
owner: 
affects:
agents:
  - design/activity/card__7bdf27fc-963c-4545-83e2-93410e67f0e3.json#conversation=agent-3a1c3e32-614b-426e-b476-f352de7635ae
policy:
after: 
---
# Current state

`CodexStreamingAdapter` handles structured questions, but not Codex app-server approval requests. `item/fileChange/requestApproval` and `item/commandExecution/requestApproval` fall through as protocol diagnostics, for example `item/fileChange/requestApproval: unknown (...)`. No approval UI or JSON-RPC response exists, so the turn remains blocked.

# Implementation details

- Handle both approval methods as server-initiated JSON-RPC requests before notification handling. Validate request, item, thread, and turn ids; track pending requests by request id; clear them on `serverRequest/resolved`.
- Add a dedicated approval contract through `AgentRunnerService`, action execution events, Electron preload/local bridge, and remote control. Respond with `{ decision }`; for command requests, honor `availableDecisions` when supplied. Keep approvals separate from structured questions and conversation messages.
- Store pending approvals in `ActionExecutionService`. Keep execution `waitingForInput` while any question or approval remains. Replay must restore unresolved approvals and discard resolved ones after renderer reload.
- Add a separate popup approval component. Show reason plus command, working directory, parsed actions, network host/protocol, requested permissions, or affected file paths when available. Actions sit bottom-right: allow once, allow for session, decline, and stop turn. Show policy-amendment choices only when Codex supplies them.
- Support multiple pending approvals without overwriting one another. Disable a submitted request until response or resolution; reject duplicate, stale, mismatched, or unsupported decisions clearly.
- Do not persist approval requests or decisions in conversation/activity files or agent handoff context. Existing completed command/file activity remains authoritative.
- Add adapter, runner, execution-contract, bridge, remote-control, service, popup, reload, and regression tests. Run lint and tests in `desktop/` and `app/`.

# Acceptance criteria

- File-change and command-execution approval requests show actionable prompts instead of protocol diagnostics.
- Allow once/session, decline, stop-turn, and offered policy-amendment choices send the exact matching JSON-RPC decision and unblock Codex.
- Approval UI shows available security context before user decides, including network-specific context when present.
- Concurrent requests remain isolated; `serverRequest/resolved`, turn completion, or cancellation removes only matching pending requests.
- Renderer reload and remote-control clients retain correct pending approval state.
- Structured questions, activity ordering, changed-path tracking, and conversation persistence keep existing behavior; approval data is not persisted.
