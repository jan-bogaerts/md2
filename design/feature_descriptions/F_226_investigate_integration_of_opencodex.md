---
author: 
id: F_226
internalId: b97071c8-d9a2-4039-8fbf-c313219a761c
title: investigate integration of opencodex
status: new
owner: 
affects:
agents:
  - design/activity/card__b97071c8-d9a2-4039-8fbf-c313219a761c.json
policy:
after: ed8ce460-5ff7-46f0-8bf2-09764585b8b2
---

we need to check if it is possible to integrate the `opencodex` agent  runner in a similar way as we did for codex and claude

## Investigation

The runner is named [OpenCode](https://dev.opencode.ai/docs/), not OpenCodex. Integration is feasible, but a complete integration is not a profile-only configuration change.

OpenCode offers three relevant interfaces:

- `opencode run --format json` provides JSONL events, model selection, token usage, session IDs, and continuation through `--session`. This is sufficient for an initial non-interactive runner. See the [CLI documentation](https://dev.opencode.ai/docs/cli/).
- `opencode acp` provides a persistent JSON-RPC process with session updates and interactive permission requests. This most closely matches the current streaming Codex/Claude experience. See the [ACP documentation](https://dev.opencode.ai/docs/acp/).
- `opencode serve` exposes an HTTP API and server-sent event stream. It supports sessions and permission responses, but adds server lifecycle, port, and authentication handling without a clear benefit over ACP for the desktop app. See the [server documentation](https://dev.opencode.ai/docs/server/).

### Required work

- Add an `opencode` built-in profile and command adapters in `shared/agent_profiles.mjs`. OpenCode models use `provider/model`; reasoning is selected with `--variant`.
- Add an OpenCode event parser for assistant text, session ID, tool events, errors, token usage, and changed paths. The existing protocol parser assumes every non-Codex event is Claude.
- For full conversation support, add an ACP streaming adapter in `desktop/src/actions/agent/agent_streaming_adapter.js`, including permission responses, cancellation, and session continuation.
- Extend the hard-coded provider lists used by usage-metrics persistence and loading. Account quota polling should remain unsupported unless a reliable provider-neutral source is found.
- Add protocol fixtures and tests for execution, continuation, malformed output, token accounting, file changes, permissions, cancellation, and a missing session.

### Risks and recommendation

The CLI's JSON event schema is provider-specific, OpenCode supports many dynamically configured providers/models while MD2 profiles use static model lists, and `opencode run` cannot provide MD2's interactive approval flow. The local machine also does not currently have the `opencode` executable installed, so no end-to-end Windows probe was possible.

Implement in two stages: first support non-streaming `opencode run --format json` with explicit models and no interactive approvals; then add ACP as a separate follow-up for feature parity. Do not base the integration on `opencode serve` unless MD2 later needs one shared long-running OpenCode instance.
