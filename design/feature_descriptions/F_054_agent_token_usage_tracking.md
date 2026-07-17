---
id: F_054
title: track agent token usage per card, version and project
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

Agent turns run through the desktop `AgentRunnerService` (`desktop/src/actions/agent_runner_service.js`), which streams each provider JSONL event into a per-conversation log file (the `.md2-agent-logs/*.json` files referenced from a card's `agents:` header). The providers already report token usage at the end of a turn, but md2 discards it — nothing extracts, stores, or displays it. Users have no idea how many tokens (or how much cost) a card, a release, or the whole project has consumed.

Both supported providers emit usage; the shapes differ and must be normalized:

- **Codex** (`codex exec --json`): the final `turn.completed` event carries
  `usage: { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens }`
  (confirmed in `desktop/test_agent_spawn.mjs`).
- **Claude** (`--output-format stream-json`): the terminating `result` event carries a
  `usage` object (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`) plus `total_cost_usd` and `num_turns`; individual `assistant`
  events also carry per-message `usage`. So Claude has an equivalent — we read it from the
  final `result` event.

These events already flow through `AgentProviderProtocolParser` and are persisted as raw events, so the data is present; we just need to parse, normalize, aggregate and surface it. Aggregation must stay local — no external service (md2 is simple, free, open source).

## Fix

- Add usage extraction to the provider protocol layer (`desktop/src/actions/agent_provider_protocol.js`): from the turn-terminating event (`turn.completed` for codex, `result` for claude), emit a normalized usage record with a common shape, e.g. `{ inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens, costUsd? }`. Missing fields default to 0; `costUsd` is optional (only Claude currently reports it).
- Capture that record in `AgentRunnerService`: store the turn's normalized usage on the conversation (e.g. `conversation.usage`) and persist it with the conversation log via `agent_conversation_persistence`. A conversation that spans multiple resumed turns accumulates usage across turns.
- Aggregate in the renderer without re-reading files beyond the already-loaded agent logs:
  - **per card** — sum usage across every log in a card's `agentLogReferences` (`app/src/services/agent_integration.ts` already loads these);
  - **per version (release)** — sum usage across the cards in each `history/{release}/` folder (see F_024) plus the current active board as the in-progress version;
  - **project total** — sum across all versions.
- Surface the numbers read-only in the UI (card view footer/detail, a release/version summary, and a project total — placement TBD in review). Show cost when available; otherwise show tokens only.
- Persist nothing new in card headers; usage lives in the agent log files (already committed), so totals are reproducible from the repo alone.

## Edge cases

- A provider event without a usage object (older CLI, cancelled/failed turn): contributes 0, never `NaN`.
- Claude per-message `usage` vs the final `result` usage: use the authoritative `result` total for the turn; do not double-count assistant-message usage.
- Cached input tokens (both providers) are reported separately — surface them distinctly rather than folding into input, since they are priced differently.
- A card referencing a missing/unreadable log (already handled leniently in `agent_integration`): skip it for totals, do not fail the aggregation.
- Cost is only meaningful when the provider reports it; never estimate cost from tokens without a configured price.
- Malformed usage JSON must not break turn completion — it is already tolerated as a normal provider event.

## acceptance criteria

- After a codex turn, the conversation log records normalized usage matching the `turn.completed.usage` numbers; after a claude turn it matches the `result.usage` (and `total_cost_usd` when present).
- A card's displayed token total equals the sum of usage across all its referenced agent logs; a card with no agent runs shows zero.
- Each release/version shows the summed usage of its archived cards, and the project total equals the sum across all versions plus the active board.
- Cancelled, failed, or usage-less turns contribute 0 and never produce `NaN` or break the run.
- Cached-input tokens are tracked and shown separately from fresh input tokens.
- Totals are derived purely from committed agent logs (no extra header fields), so re-opening the project reproduces the same numbers.
- Tests cover: codex and claude usage parsing, multi-turn accumulation, per-card / per-version / project aggregation, missing-usage and missing-log tolerance.

## see also

- `desktop/src/actions/agent_provider_protocol.js`
- `desktop/src/actions/agent_runner_service.js`
- `desktop/test_agent_spawn.mjs`
- `app/src/services/agent_integration.ts`
- `design/feature_descriptions/ready/F_024_history_archiving.md`
- `design/feature_descriptions/ready/F_050_one_shot_agent_conversations.md`
