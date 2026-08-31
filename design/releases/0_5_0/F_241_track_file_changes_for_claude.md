---
author: 
id: F_241
internalId: 573854b5-fd44-4868-918e-56fdb505a905
title: track file changes for claude
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__573854b5-fd44-4868-918e-56fdb505a905.json
policy:
after: b632dc97-1096-488d-aae6-82c1516fa0b0
---
for Codex, we track the file changes that are reported by the cli. these values are shown on the UI in the action popup.

However, it seems we don't do this for claude.

so we need to investigate which messages we need to track, extract the values, store them in the activity and show them on the UI.

Since this feature already exists for codex, we need to be careful and make certain that we share functionality where possible.

we should also try to make it fairly generic for the consumers of the data. What I mean: we shouldn't have agent specific code at all levels of the algorithm.

## Current state

Codex app-server events already provide completed `fileChange` items with patches. `agent_codex_event.js` counts `+` and `-` content lines, `createProviderEventEntry` persists those counts as optional `insertions` and `deletions`, and renderer code sums completed `fileChange` entries. `ActionUsageSummary` then shows conversation or action/card totals in action popup. These persistence, aggregation, and UI layers are provider-neutral.

Claude path is incomplete. `ClaudeStreamingAdapter` recognizes `Edit`, `MultiEdit`, `NotebookEdit`, and `Write` as `fileChange` tools and records their paths and lifecycle, but `handleToolResults` keeps only display text from `tool_result`. It ignores top-level `tool_use_result`, so completed Claude entries have no line counts. Non-streaming parser records Claude tools as generic transcript events rather than canonical provider events, creating different results for same Claude protocol.

Claude Code 2.1.238 reports enough data after successful execution. `Edit` and `Write` results contain `structuredPatch`: hunks whose `lines` use leading space for context, `+` for insertion, and `-` for deletion. `NotebookEdit` reports old and new cell source plus edit mode. Failed tool results carry `is_error` and must not count.

## Implementation details

* Extract patch-line counting from `agent_codex_event.js` into provider-neutral file-change helpers. Codex keeps its unified-diff decoding, while both providers use same validated counting of patch lines. Context and `\ No newline at end of file` markers do not count.
* Add shared Claude file-result decoder in `agent_claude_events.js`. For successful `user` messages, correlate each `tool_result.tool_use_id` with provider item ID and normalize supported file results to completed `fileChange` events containing path, `insertions`, and `deletions`.
* Count `Edit`, `MultiEdit`, and `Write` from valid `tool_use_result.structuredPatch` hunks. Count `NotebookEdit` from smallest line-level insert/delete difference between `old_source` and `new_source`; treat old side as empty for `insert` and new side as empty for `delete`. Define line-level difference as changed whole lines, not changed characters.
* Use same Claude decoder in `ClaudeStreamingAdapter` and `AgentProviderProtocolParser`. Streaming completion replaces existing in-progress event through current `providerItemId` reconciliation. Non-streaming path must emit canonical provider events instead of only `tool.*` transcript entries.
* Extend one-shot runner handling to persist normalized provider events through `createProviderEventEntry`. Keep `AgentConversationEvent`, activity JSON shape, renderer aggregation, and action-popup UI unchanged; they already accept optional counts from any provider.
* Count only completed, successful file tools with structurally valid result data. Denied, cancelled, failed, partial, malformed, or unknown results retain transcript visibility but contribute no count. Do not infer counts from tool input, current filesystem, Git state, or success text because those sources can differ from applied patch.
* Bash or PowerShell commands that happen to edit files remain outside provider file-change totals because Claude reports no file patch for them. Existing captured-commit fallback remains unchanged when conversation reports no countable file changes.
* Add tests for shared patch validation/counting, every supported Claude result shape, zero-line/no-op changes, failed and malformed results, streaming replacement, non-streaming parity, persisted counts, and unchanged Codex behavior. Existing app aggregation and action-popup tests cover provider-neutral consumption; add UI coverage only if renderer behavior changes.

## Acceptance criteria

* Successful Claude `Edit`, `MultiEdit`, `NotebookEdit`, and `Write` operations with valid result data persist completed `fileChange` entries containing exact non-negative `insertions` and `deletions`.
* Claude counts come from applied result data after tool completion, not proposed input. Failed, denied, cancelled, incomplete, malformed, and unsupported operations do not affect totals.
* Context lines and no-newline markers do not affect counts. Empty successful changes persist `0` insertions and `0` deletions.
* Streaming and non-streaming Claude runs normalize equivalent result messages to same canonical event shape and totals.
* Codex keeps current file-change counts and uses shared provider-neutral counting helpers where patch semantics match.
* Existing activity files without counts continue loading. No activity schema migration is required because count fields are already optional.
* Action popup shows Claude conversation and action/card change totals through existing scope control, aggregation, formatting, and commit fallback; no Claude-specific renderer branch is added.
* File changes made only through shell commands are not presented as provider-reported file-change totals.
