---
author:
id: F_85
internalId: 7370ea37-ac9b-4445-a129-89e1ae5c7cb8
title: Codex app-server activity and rate-limit backend
status: ready
owner:
affects:
policy:
  checkLinting: true
  requireTests: true
---

# Goal

Normalize Codex app-server item lifecycles into complete live and persisted conversation activity, and expose account rate limits as app-wide runtime state.

# Current state

Streaming Codex runs use `CodexStreamingAdapter`, then `AgentRunnerService`, persisted conversation JSON, action-execution events, Electron IPC, and remote-control forwarding.

- `item/agentMessage/delta` text is appended to one assistant message per turn. Its `itemId` is ignored. Completing that `agentMessage` therefore adds no boundary before the next message item.
- `reasoning` is explicitly silent in `agent_codex_events.js`; reasoning start, summary deltas, raw-text deltas, section boundaries, and completion are ignored.
- A completed `commandExecution` becomes a generic transcript event. `aggregatedOutput` wins over `command`, so the command itself is commonly lost. `item/started` and command output deltas are ignored.
- `conversation.events` can store only `{ content, id, timestamp, type }`. `shared/agent_conversations.mjs` strips additional fields.
- `account/rateLimits/updated` is ignored. Existing token usage is per conversation and persisted; it is a different concept.
- File changes are used for commit scoping. Other useful Codex items (`webSearch`, MCP/dynamic/collaboration tools, image views, plans, compaction) are at best stored as opaque completed output.

Codex app-server defines `item/started` and `item/completed` as the shared lifecycle, with completion authoritative. Deltas identify their item through `itemId`. Rate limits are account-wide and may contain multiple buckets.

# Implementation details

## Codex protocol normalization

- Track active items by provider `item.id`; validate every delta against `params.itemId`. Keep tracking inside `CodexStreamingAdapter`, not generic provider code.
- On `item/agentMessage/delta`, append text exactly as received and associate the item id with the current assistant stream.
- On matching `item/completed` for `agentMessage`, append exactly `\n\n` once when that item produced deltas. Do not append for duplicate completion, an unrelated id, or a completed item with no streamed text.
- Treat completed item data as authoritative. Reconcile status and final fields by item id instead of creating duplicate activity.
- Normalize these Codex items:
  - `reasoning`: started/in-progress/completed state; readable `summary`; `summaryTextDelta`; `summaryPartAdded`; raw `textDelta` or final `content` only when Codex supplies it.
  - `commandExecution`: command and working directory from start; ordered `outputDelta`; final status, `aggregatedOutput`, exit code, and duration from completion.
  - `fileChange`: affected paths, change kinds, final status, and changed-path extraction already used for commits.
  - `webSearch`, `mcpToolCall`, `dynamicToolCall`, `collabToolCall`, and `imageView`: concise label/input, lifecycle status, and safe final result/error where present.
  - `plan` and `contextCompaction`: concise conversation activity. Final plan text replaces non-authoritative deltas.
- Keep review-mode, model-reroute, safety-buffering, verification, and turn failure notifications as system activity when they affect what the user sees or why execution paused.
- Unknown item types must not fail the run. Record a diagnostic containing method/type and item id, not the complete raw envelope.
- Continue using generated app-server schemas from the installed Codex version as protocol fixtures. Do not infer fields through casing fallbacks beyond the already verified exec/app-server vocabulary.

## Conversation activity contract

- Extend conversation events with selected structured fields needed by UI: provider item id, stable sequence, lifecycle status, label, command, working directory, output, exit code, and duration. Do not persist whole protocol objects.
- Assign sequence at ingestion so messages and activities can be rendered deterministically even when timestamps match. Updating a streamed item retains its sequence.
- Persist reasoning and command/tool activity with the conversation. Keep account rate limits out of conversation JSON, card activity, project activity, action logs, telemetry payloads, and Git commits.
- Extend `AgentRunnerService.handleStreamingEvent` to upsert activity by item id, redact known secret answers from every textual field, queue persistence, and emit a live `agentActivity` update.
- Keep reasoning excluded from `normalizeConversationContext`; continued agents must not receive hidden reasoning. Keep relevant command/tool results available to the existing handoff transcript.
- Preserve existing assistant/user message ownership. Activities are not assistant messages and must not affect provider-session message cursors.

## Runtime rate-limit channel

- Handle `account/rateLimits/updated` separately from run events. Also issue `account/rateLimits/read` after initialization so the status bar need not wait for a later change.
- Normalize the single-bucket and `rateLimitsByLimitId` forms into an array keyed by `limitId`. Preserve `limitName`, primary/secondary windows, used percent, reset time, plan type, reached type, credit summary, and observation time.
- Publish through a dedicated Codex-runtime channel assembled in the Electron main process. It must not carry execution id, action id, card id, project, or conversation reference.
- Keep only the latest in-memory snapshot needed by connected renderers. Never write it to disk. Electron restart clears it.
- Forward runtime updates through preload IPC and remote control so local and connected React clients share behavior. A disconnected client receives no stale persisted value.
- Multiple Codex processes may report the same account. Accept the newest valid observation; malformed or older observations must not erase newer data.
- API-key/non-ChatGPT sessions may return no limits. Publish an unavailable state; do not fabricate zero usage.

# Edge cases and failure modes

- Interleaved agent-message items: only matching completion closes each stream.
- Repeated or out-of-order deltas/completions: no duplicate separator or activity row; log a diagnostic for impossible ordering.
- Empty reasoning: retain state while running, then allow a completed textless reasoning entry.
- Reasoning summary sections: preserve boundaries without inventing whitespace inside provider text.
- Long or binary-looking command output: preserve text safely; never log or render raw buffers as JSON.
- Failed/declined command: retain command, status, output, and exit information.
- Secret prompt answers or terminal interaction: apply redaction; do not persist terminal-input notifications as command output.
- Concurrent Codex runs: activity remains run-scoped; rate limits remain account-scoped.
- Renderer reload or remote reconnect: recover active execution activity through existing execution replay; recover only current in-memory rate limits.
- Unsupported Codex versions: diagnostics identify unknown events without terminating valid turns.

# Testing implications

- Add adapter tests for matching item ids, one separator per completed agent message, interleaving, duplicates, and no-delta completion.
- Add reasoning tests covering start, summary sections, raw text availability, completion, and empty content.
- Add command tests covering start, output deltas, authoritative completion, failure/decline, and exact command retention.
- Add structured activity persistence/parser tests, ordering tests, redaction tests, and conversation-handoff exclusion for reasoning.
- Add rate-limit tests for initial read, update notification, multi-bucket payloads, null fields, concurrent reporters, no-auth/unavailable state, and proof that persistence is never called.
- Add preload, local bridge, remote-control, and action-execution contract tests for live activity and runtime updates.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in `desktop/`; run affected shared-contract tests in `app/`.

# Acceptance criteria

- Two streamed Codex agent-message items render as separate paragraphs because each matching completion appends one blank line.
- Reasoning and every started command are available live and after conversation reload, keyed by provider item id.
- Completed command state contains the exact command plus final output/status; it is not replaced by output-only generic text.
- File and supported tool/search items produce ordered, typed activity without raw protocol envelopes.
- Existing changed-path collection, token usage, interactive questions, turn lifecycle, and provider continuation still work.
- Rate limits reach all connected app clients as account-wide runtime data and never appear in persisted project or conversation files.
- Unknown valid Codex notifications do not crash an agent run.

# See also

- [F_86 Codex conversation activity and rate-limit UI](F_86_codex_conversation_activity_frontend.md)
- [F_052 agent popup conversation layout](../releases/0_0_2/F_052_agent_popup_conversation_layout_and_expansion.md)
- [F_054 agent token usage tracking](../releases/0_0_2/F_054_agent_token_usage_tracking.md)
- [F_83 chatlog sticky at end](F_83_chatlog_sticky_at_end.md)
