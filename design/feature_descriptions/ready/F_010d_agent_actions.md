---
id: F-010d
title: agent actions
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal

Execute `agent` actions through the Electron action runner with run-specific prompt input, live conversation input, cancellation, history for the same action id/context, and conversion of custom prompts to reusable definitions.

## Current state

Agent processes and streaming exist in Electron, but React still constructs agent execution requests and owns action-chain orchestration. Action history and conversion are keyed by action name and emit the legacy action shape.

## implementation details

- The popup sends the action `id`, context, and run-specific agent/model/thinking-level and extra-prompt input to the Electron action runner. It does not send the persisted `prompt` or executable agent command.
- Electron loads the agent action by id, resolves its `prompt`, combines extra input, applies supported run-time selection, and starts it as a chain phase.
- Extensible agent profiles remain a future feature. This slice keeps the supported Codex/Claude capability and model selection only.
- Stream stdout/stderr through Electron action events and persist the agent conversation incrementally.
- While the process is running, conversation input is forwarded to its stdin.
- After completion, input starts or resumes a linked conversation run. Single-click `Continue` supplies `continue` as that continuation input.
- Cancelling the action asks the Electron action runner to stop the agent process and chain.
- Load and display history for the same action `id` and context. Record the effective agent/model/thinking level used for the run.
- `Convert to action` writes a new canonical action definition with generated stable `id`, editable name/label, `type: "agent"`, and `prompt`.
- Agent actions participate in the same `onBefore`/`on`/`onAfter` execution and failure semantics as command actions.

## acceptance criteria

- Agent runs resolve their persisted definition by id in Electron.
- Extra prompt and supported per-run choices affect only that run.
- Live input reaches stdin; post-completion input creates or resumes a linked run instead of targeting a dead process.
- Single-click `Continue` sends the continuation input and links the resulting log.
- Cancellation stops the active agent and reports a cancelled action execution.
- History is keyed by action id/context and remains available after an action rename.
- Conversion writes the canonical ID-based action shape.
- Tests cover prompt construction, live input, continuation, cancellation, history identity, conversion, and agent phases inside a chain.

## see also

- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\writings\Running actions\running_actions.md`
- `design\feature_descriptions\ready\F_012_agents.md`
- `design\feature_descriptions\ready\F_023_agent_streaming.md`
