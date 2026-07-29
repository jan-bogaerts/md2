---
internalId: a4f100ca-bac5-4ef0-a4e8-c4dae545a3f8
---

# F_76: Action option — `streaming` or `oneshot` agent mode

Follow-up on [F_75](F_75_agent_confirm_gate_in_one_shot_cli.md). Add per-action choice: run agent one-shot (current behaviour) or keep a live streaming session that accepts more turns mid-run.

## Current state

Every agent run is one-shot. In [agent_runner_service.js](../../desktop/src/actions/agent_runner_service.js):

- `start()` spawns the CLI with the prompt as the **last argv element** (`argumentsList = [...configuredArguments, prompt]`).
- `contextInput` written to stdin, then `child.stdin.end()` immediately.
- stdout parsed as JSONL by [agent_provider_protocol.js](../../desktop/src/actions/agent_provider_protocol.js).
- `handleClose()` is the only terminal path: persists conversation, releases `runningConversationIds`, calls `onComplete`.

Commands built in [shared/agent_profiles.mjs](../../shared/agent_profiles.mjs):

- codex: `codex [--search] exec --json`
- claude: `claude --print --verbose --output-format stream-json`

Multi-turn today is **faked**: each turn is a new process, continuity comes from `buildResumeAgentCommand` (`claude --resume <id>` / `codex exec resume --json <id>`) plus transcript replay through `contextInput`. So a conversation = sequence of one-shot processes. One process = one turn = one `assistant` message (`${runId}-assistant`).

## Provider reality

| | one-shot | streaming |
|---|---|---|
| claude | `--print --output-format stream-json` | same command + `--input-format stream-json`, stdin stays open, user turns pushed as JSON lines |
| codex | `exec --json` | **not supported by `exec`** — stdin takes one prompt then closes |

Claude streaming is a flag plus a stdin writer. Codex streaming needs a different entry point (`codex app-server` JSON-RPC, or `@openai/codex-sdk`), with a different wire protocol than the current JSONL parser. That asymmetry is the bulk of the cost.

## Proposed model

New optional action field `mode: 'oneshot' | 'streaming'`, default `oneshot`, agent-actions only (rejected on command actions, same as `trackFileChanges`). Optional per-run override in `runInput`.

## Work required

### shared

- [shared/action_definitions.mjs](../../shared/action_definitions.mjs) — add `mode` to `ACTION_DEFINITION_FIELDS` / `ACTION_ON_RULE_FIELDS` lists (lines 15, 32), to builtin defaults (lines 86, 109), normalize (line ~312), output (line ~408). Reject on command actions next to the `trackFileChanges` check (line 252). Validate enum value with a routing `code` like the other validators.
- [shared/action_definitions.d.mts](../../shared/action_definitions.d.mts) — `mode?: string` on `RawActionDefinition`, `mode: 'oneshot' | 'streaming'` on `ActionDefinition`.
- [shared/agent_profiles.mjs](../../shared/agent_profiles.mjs) — `STREAMING_COMMAND_ADAPTERS` next to `OUTPUT_COMMAND_ADAPTERS`; claude appends `--input-format stream-json`. Add a `supportsStreaming(profile)` predicate so unknown/custom profiles report false. `buildAgentExecutionCommand` takes the mode.
- `shared/agent_profiles.d.mts` — matching types.

### desktop

- [action_run_request.js](../../desktop/src/actions/action_run_request.js) — add `mode` to `ALLOWED_RUN_INPUT_FIELDS`.
- [action_agent_executor.js](../../desktop/src/actions/action_agent_executor.js) — resolve mode from `runInput.mode ?? action.mode`, pass to command build and into `request`.
- [agent_runner_service.js](../../desktop/src/actions/agent_runner_service.js) — the real work:
  - streaming: do **not** `stdin.end()`; write the first turn as a JSON line instead of appending prompt to argv.
  - new `sendTurn(runId, text)` writing the next user turn; append the user message to the conversation.
  - split **turn end** from **process end**. Today they are the same event. Streaming needs a turn boundary (`result` for claude, `turn.completed` for codex) that resolves the current turn while the process stays alive.
  - `${runId}-assistant` message id assumes one assistant message per run — needs per-turn ids in streaming.
  - `runningConversationIds` guard, conversation persistence, and `onComplete` all hang off `handleClose`; each needs a streaming-aware trigger.
  - lifetime: an idle streaming process must be reaped (idle timeout, or app shutdown via existing `stopAll`).
- [agent_provider_protocol.js](../../desktop/src/actions/agent_provider_protocol.js) — emit an explicit `turnCompleted` alongside `turnStarted`; parser is currently per-process and resets nothing between turns.

### app

- `app/src/data/action_run_types.ts`, `app/src/data/electron_action_bridge.ts` — new IPC channel for "send turn"; run result no longer arrives only at process close.
- `app/src/services/actions/action_execution_service.ts` — model a run that stays open between turns.
- [action_definition_fields.tsx](../../app/src/components/actions/action_definition_fields.tsx) — mode control in the agent-only block beside "Auto commit"; disable/warn when the selected agent profile does not support streaming.
- `action_definition_writer.ts` and validation-error field mapping.

### tests

`agent_runner_service.test.mjs`, `agent_profiles_parity.test.mjs`, `action_definitions.test.mjs`, `action_entry_point_parity.test.ts`, `action_definition_fields.test.tsx`.

## Risks

- **Codex has no streaming `exec`.** Without app-server/SDK work, `streaming` is claude-only.
- Long-lived child processes: leaks, zombie `runningConversationIds`, cancel semantics on app quit.
- Persistence currently assumes terminal state at process close; streaming needs incremental persistence or the transcript is lost on crash.
- Codex CLI surface churns — verify `app-server` flags before committing to it.

## Suggested phasing

1. Field + validation + UI, `streaming` accepted but only claude offers it; unsupported profile falls back to `oneshot` with a visible warning.
2. Claude streaming in `agent_runner_service` (stdin writer, turn boundary, per-turn message ids).
3. Codex streaming via `codex app-server` or `@openai/codex-sdk`, as a second protocol adapter.
