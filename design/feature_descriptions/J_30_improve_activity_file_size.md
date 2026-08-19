---
author: 
id: J_30
internalId: d67b763d-819f-4e7e-aab5-c3c9f28e594d
title: improve activity file size
status: design
owner: 
affects:
agents:
  - design/activity/card__d67b763d-819f-4e7e-aab5-c3c9f28e594d.json
policy:
---

# Problem

Activity files embed complete agent conversations. Large tool results make these files expensive to read, parse, rewrite, transfer, and commit. Output can also contain another activity file or a broad repository search result, so later activity may embed earlier activity and amplify the growth.

## Investigation results

The 51 files currently in `design/activity` occupy about 149 MB. Compact JSON would save only about 1.7 MB. Compact representations of the main sections show:

- conversations: about 147.4 MB;
- records: about 0.14 MB;
- conversation entries: about 147.3 MB;
- `commandExecution` entries: about 144.2 MB.

The record model, repeated field names, indentation, user prompts, assistant replies, and reasoning are therefore not meaningful targets. Command output accounts for nearly all current activity size.

There are two concrete causes:

1. Command output is unbounded. `CodexStreamingAdapter` appends every `item/commandExecution/outputDelta`, and the completed `aggregatedOutput` remains complete. `agent_codex_event.js` has a 16,384-character limit for selected tool content, but `commandEvent()` and command output deltas bypass it. Claude tool results also use `normalizedContent()` without this limit.
2. Some historical `commandExecution` entries contain the same result in both `content` and `output`. Across the sample files, the redundant `output` fields account for about 20.5 MB. The current conversation parser discards `output` for `commandExecution`, but `createProviderEventEntry()` can still add it to the runtime conversation and `upsertConversation()` writes that runtime value without first canonicalizing it.

The largest single command entries are 2.5-2.7 MB because a 1.2-1.3 MB result is stored twice. Examples include unrestricted repository searches and reading an existing activity file.

## Proposed change

Limit every persisted command or tool result to 16,384 characters. This matches the limit already present in `agent_codex_event.js` and keeps enough diagnostic context without allowing one tool call to dominate an activity file.

- Apply one shared truncation rule at provider normalization, before entries reach the runtime conversation or persistence.
- For `commandExecution`, keep the exact command in `command`, store its result only in `content`, and never also store it in `output`.
- Apply the same result limit to Codex MCP/dynamic tool results and Claude tool results. Tool input and command text are separate fields and must not be truncated by the result limit.
- Retain the beginning and end of oversized results with an explicit omitted-character marker. The end commonly contains an error, exit summary, or test result; prefix-only truncation loses that evidence.
- Bound command output while deltas arrive, not only on completion. A checkpoint can otherwise persist an oversized in-progress entry, and the runtime still accumulates the complete value in memory.
- Use the bounded entry for the chat display, persistence, and `normalizeConversationContext()` so reload and cross-provider handoff do not disagree about the transcript. Native provider-session continuation remains authoritative when available.

Applying deduplication plus a 16,384-character result limit to the current sample would reduce the files from about 149 MB to about 32 MB, roughly 79%. For comparison, 4,096 characters produces about 19 MB and 65,536 characters about 43 MB. The existing 16,384-character convention is the least surprising choice.

Do not minify activity JSON: the measured saving is about 1%, while readable files and Git diffs become worse. Do not split conversations into separate files as part of this change: that can reduce rewrite scope but does not materially reduce total stored data.

## Existing activity

New limits only prevent future growth. Add explicit compaction for existing current and released activity rather than silently depending on a later conversation update:

- parse through the canonical activity/conversation parser;
- truncate oversized command/tool results with the same shared rule;
- remove `commandExecution.output`;
- preserve conversation IDs, entry IDs, ordering, status, usage, records, and references;
- write only files whose canonical value changed and report malformed files through the existing repair result.

Compaction changes historical transcript text and can create a large one-time Git diff. It must be an explicit project operation or migration decision, not an incidental write while viewing activity. Browser-hosted and local projects must produce the same canonical result.

## Affected components

- `desktop/src/actions/agent/agent_codex_event.js`: use the shared bounded-result rule for command results as well as other Codex tool results.
- `desktop/src/actions/agent/agent_streaming_adapter.js`: keep streamed command output bounded.
- `desktop/src/actions/agent/agent_claude_streaming_adapter.js`: bound Claude tool results and avoid duplicate command-result fields.
- `desktop/src/actions/agent/agent_conversation.js`: prevent `commandExecution.output` from entering canonical runtime entries.
- `shared/agent_conversations.mjs`: enforce the canonical persisted entry shape and shared limit.
- `desktop/src/actions/activity/activity_files.js`: add explicit existing-file compaction without changing normal activity ownership or references.
- `desktop/src/actions/agent/agent_transcript.js` and conversation UI: continue consuming the canonical bounded fields and expose the truncation marker.

## Edge cases and compatibility

- Preserve short output byte-for-byte.
- Preserve exact commands, exit codes, durations, working directories, statuses, and file-change counts.
- Truncate by JavaScript string boundaries without splitting a surrogate pair.
- Redact secrets before retaining head or tail so truncation cannot bypass redaction.
- An oversized failing command must retain its final error context.
- Repeated streamed revisions of one provider item must remain one entry with a stable ID and sequence.
- Cross-provider or missing-session fallback receives bounded tool context. User and assistant messages remain complete.
- Malformed and future-version activity keeps the existing strict repair behavior.

## Testing implications

- Unit-test the shared boundary at below, exactly at, and above 16,384 characters, including Unicode and the omitted-character marker.
- Test Codex output deltas and authoritative completion with output larger than the limit.
- Test Claude commands and other tools to prove results are bounded and command output is not duplicated.
- Test that short entries and all non-result fields remain unchanged.
- Test persisted, reloaded, rendered, and handoff transcripts use the same bounded content.
- Test explicit compaction changes only oversized/duplicate output and is idempotent.
- Test malformed and future-version files are not partially rewritten.

## Acceptance criteria

- No canonical command or tool result exceeds 16,384 characters.
- A `commandExecution` entry stores its result once in `content` and has no `output` field.
- Large streaming output remains bounded before the command completes.
- Truncated results clearly retain useful beginning and ending context.
- Existing activity can be compacted explicitly without changing references, identities, ordering, records, usage, or unrelated transcript content.
- The representative sample shrinks to approximately the measured 32 MB range after compaction.
