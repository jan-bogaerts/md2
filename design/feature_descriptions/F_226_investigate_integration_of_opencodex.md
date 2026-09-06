---
author: 
id: F_226
internalId: b97071c8-d9a2-4039-8fbf-c313219a761c
title: investigate integration of opencode
status: new
owner: 
affects:
agents:
  - design/activity/card__b97071c8-d9a2-4039-8fbf-c313219a761c.json
policy:
after: 64640333-ea8c-4d4f-b2a4-2d32e74f7545
---
we need to check if it is possible to integrate the `opencodex` agent  runner in a similar way as we did for codex and claude

## Investigation

The runner is named [OpenCode](https://dev.opencode.ai/docs/), not OpenCodex. Integration is feasible through a new reusable agent protocol.

MD2 currently has profiles for Codex and Claude, but a profile does not declare its protocol. Instead, command construction, output parsing, streaming, permissions, and resume behavior are selected through hard-coded checks against the profile name. This prevents a profile for another runner from reusing an existing protocol.

OpenCode offers three relevant interfaces:

* `opencode run --format json` provides provider-specific JSONL events. Supporting this would require an OpenCode-specific protocol and would not provide MD2's interactive approval flow. See the [CLI documentation](https://dev.opencode.ai/docs/cli/).
* `opencode acp` provides a persistent JSON-RPC process with sessions, tool updates, and interactive permission requests. ACP is runner-neutral and fits the current streaming conversation model. See the [ACP documentation](https://dev.opencode.ai/docs/acp/).
* `opencode serve` exposes an HTTP API and server-sent event stream. It supports sessions and permission responses, but adds server lifecycle, port, and authentication handling without a clear benefit over ACP for the desktop app. See the [server documentation](https://dev.opencode.ai/docs/server/).

### Required work

* Add a required protocol identifier to agent profiles. The existing profiles use `codex` and `claude`; the OpenCode profile uses `acp`.
* Select command construction, output parsing, streaming, permissions, and resume behavior by protocol instead of profile name. Profiles continue to own the executable, supported models, and defaults.
* Add an ACP adapter in `desktop/src/actions/agent/agent_streaming_adapter.js`, including initialization, session creation/loading, prompts, assistant and tool updates, permission responses, cancellation, token usage, and changed paths.
* Add an `opencode` built-in profile configured to start `opencode acp`. OpenCode becomes the first ACP-backed profile, while future ACP runners can reuse the same adapter.
* Extend the hard-coded provider lists used by usage-metrics persistence and loading. Account quota polling should remain unsupported unless a reliable provider-neutral source is found.
* Add protocol fixtures and tests for execution, continuation, malformed output, token accounting, file changes, permissions, cancellation, and a missing session.

### Risks and recommendation

OpenCode supports many dynamically configured providers/models while MD2 profiles use static model lists. The first implementation can keep an explicit model list; dynamic capability discovery is separate work. ACP support must also define which optional ACP capabilities MD2 requires and how unsupported capabilities are reported. The local machine does not currently have the `opencode` executable installed, so no end-to-end Windows probe was possible.

Add ACP as the third supported protocol beside Codex and Claude, then add OpenCode as its first profile. Do not add a separate OpenCode JSONL protocol or use `opencode serve` unless an ACP capability gap is verified.