---
author: 
id: F_173
internalId: bee2d3c7-81e1-451a-bc4d-d4ba59c849e9
title: token count
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__bee2d3c7-81e1-451a-bc4d-d4ba59c849e9.json
policy:
---
during a release, the token count began to change up and down like crazy. clear indication that something is going wrong during the calculation of the token usage.

We should also perform a validation on the way that token count is calculated, we need to make certain that it is correct.

token usage of released cards is no longer going to change. we can keep the summaries for these cards in more convenient places, like in a project wide json file for instance.

## Current state

`projectAgentTokenUsage` derives project and release totals from conversations currently attached to cards. Conversation loading is lazy, and release completion reparses moved cards. Totals can therefore rise or fall when activity files load or cards move, even when no new tokens were used.

Provider normalization also overcounts some Codex usage. Codex cached input is part of provider `input_tokens`, and reasoning is part of provider `output_tokens`. Current streaming normalization keeps cached input inside `inputTokens`, while both Codex paths keep reasoning inside `outputTokens`; `totalTokens` then adds those overlapping buckets again.

Released activity files remain useful for opening one card's history, but released cards are read-only and their aggregate usage no longer needs repeated calculation.

Existing activity files cannot always identify whether stored Codex input came from streaming or one-shot normalization. Their historical bucket split cannot be corrected reliably. Existing `totalTokens` must therefore remain a legacy baseline; corrected accounting starts with turns recorded after this change.

## implementation details

- Add `<projectFolder>/agent_token_usage.json` with `schemaVersion`, authoritative `projectUsage`, and immutable release entries keyed by release name. Each usage value contains preserved `legacyTotalTokens`, corrected `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, combined `totalTokens`, and optional `costUsd`. Do not store per-card summaries.
- Define token buckets as disjoint. For Codex, subtract cached input from provider input and reasoning from provider output before storing their separate buckets. For Claude, keep cache creation and cache reads in `cachedInputTokens`; keep thinking in `outputTokens` while Claude does not report a separate reasoning count. Reject negative, non-finite, or inconsistent provider values. When provider total exists, verify normalized bucket sum matches it.
- Make `projectUsage` the status-bar project's source of truth. Update it by the normalized delta only after a successful turn and conversation persistence. Serialize summary updates per project and update conversation activity plus summary in one commit so retries or concurrent turns cannot double-count or lose usage.
- When summary file is absent in an existing project, read all card activity files once. Sum their stored `totalTokens` into `legacyTotalTokens`; do not reinterpret historical input, cache, output, or reasoning buckets. Set corrected buckets to zero, calculate project and existing-release summaries, and persist new file. For new projects, `legacyTotalTokens` starts at zero. A malformed existing summary is an error; do not silently rebuild or overwrite it.
- Version conversation usage written after this change. When an existing conversation first continues, preserve its previous `totalTokens` as conversation-level legacy usage before accumulating corrected turn buckets. This keeps later release calculation able to separate legacy and corrected usage without adding per-card data to summary file.
- During release, reject completion while a target card has a running action. Read target cards' activity files directly, calculate release usage, add one release entry, and commit summary update with card and activity-file moves. Existing release name remains an error. Moving cards does not change `projectUsage` because their usage was already counted.
- Use stored release entries for release totals. Opening a released card may load its moved activity file for conversation detail, but that load must not change release or project totals.
- Keep current and archived detail derived from their card activity. Do not add current, archived, action, or card summaries to `agent_token_usage.json`.
- Add tests for Codex and Claude bucket semantics, provider-total validation, project-summary migration, malformed files, serialized/idempotent turn updates, concurrent turns, atomic release updates, active-run rejection, reloads, and opening released cards.

## acceptance criteria

- Project token total does not change when cards or activity files load, a released card opens, project reloads, or release files move.
- Each successful persisted provider turn increases project total exactly once by normalized turn usage. Failed, cancelled, retried, or unpersisted turns add nothing.
- Codex cached input and reasoning tokens appear in their own buckets without also remaining in input or output. Claude cache buckets are counted once, and Claude output remains correct when separate reasoning usage is unavailable.
- For new usage, normalized bucket sum matches provider total when provider total exists. Summary `totalTokens` equals `legacyTotalTokens` plus corrected bucket sum. Invalid or overlapping new provider values produce a reported error instead of a wrong count.
- Completing a release writes one immutable total for that release and leaves project total unchanged. Concurrent activity on target cards cannot race release calculation.
- `agent_token_usage.json` contains only schema metadata, total project usage, and per-release usage. Card history and per-card usage remain retrievable from released activity files.
- Existing projects without summary file receive one complete summary built from all card activity. Historical `totalTokens` is preserved as an explicitly named legacy baseline; only later turns claim corrected bucket accuracy. Malformed existing summaries are reported and preserved.
