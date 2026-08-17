---
author: 
id: F_194
internalId: 4191dc0a-7628-45bf-ada1-b1366e9f05f9
title: track token usage vs usage metrics
status: ready
owner: 
affects:
agents:
  - design/activity/card__4191dc0a-7628-45bf-ada1-b1366e9f05f9.json
policy:
after: dffba4e6-6ec5-4a40-8ee7-e68d4891aff3
---

we are currently already counting the tokens used by a project. we track this pretty granularly, but always related to the project: global total, per card, per action.

we also report 'account limits'. currently already working for codex, soon for claude likely too (see [F\_193\_report\_claude\_usage\_quotas.md](design/feature_descriptions/F_193_report_claude_usage_quotas.md) )

now we want to measure and save both values (deltas) over time so we can track: how many tokens were used per hour, per day, per week and how much account limits shrank in the same period, so how much account usage there was.

This allows us to check how the relationship is between token usage and account usage at various hours and days.

info should be saved in a csv file in the project folder

## Current state

Normalized token usage already flows through `AgentRunnerService` and is persisted cumulatively in each conversation activity file. Renderer aggregation in `app/src/services/agents/agent_usage.ts` derives totals per action, card, release, and project from those files. It has no observation timestamp per completed turn, so existing totals cannot produce reliable hourly, daily, or weekly deltas.

Codex and Claude account usage are separate account-wide runtime snapshots in `CodexRuntimeService` and `ClaudeRuntimeService`. Each snapshot contains observed used percentages and reset times. Codex snapshots arrive from app-server rate-limit reads and updates; Claude snapshots arrive from `ClaudeUsagePoller`. Both remain in memory and are currently never written to project storage.

Project token usage and account usage have different scopes. Token records cover this project's agent turns. Account records cover all use of that provider account, including other projects and external CLI sessions. Their time-based comparison is therefore correlation, not proof that this project caused an account-limit change.

## implementation details

* Add a desktop-owned usage-metrics service. Renderer components stay unchanged. Inject service into `AgentRunnerService`; do not derive history from renderer project totals.
* Append records to `<projectFolder>/usage_metrics.csv`, resolving path inside repository root. Create file with one header when absent. Serialize writes per file so concurrent runs cannot interleave rows. Use RFC 4180 escaping and UTC ISO-8601 timestamps.
* Use one CSV schema for two record types: `recorded_at`, `record_type`, `provider`, `limit_id`, `window_id`, `window_duration_minutes`, `resets_at`, `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens`, `used_percent`, `used_percent_delta`. Fields not applicable to record type remain empty, not zero.
* Append one `token_usage` record after each successfully completed provider turn. Values are normalized turn usage, already a delta for that turn. Record streaming turns at `turnCompleted`; record one-shot turns after successful process completion. Do not subtract project totals, because reloads, moved cards, and archived releases can change those totals without new account usage.
* Append one `account_usage` record per changed, available account window. Claude uses window ids `five_hour` and `weekly`, with limit id `default`. Codex uses each bucket's `limitId` plus `primary` or `secondary`; preserve `windowDurationMins`. Normalize reset timestamps to UTC milliseconds before CSV formatting.
* Calculate `used_percent_delta` against previous persisted observation with same provider, limit id, and window id. First observation has empty delta because no baseline exists. Within same reset window, delta is current minus previous used percent. After reset time changes, delta equals current used percent because new window starts at zero. Preserve negative same-window corrections; do not clamp them.
* Restore last valid account observation per key from existing CSV before first append so app restart does not discard delta baseline. Skip duplicate account observations whose percent and reset time are unchanged. Reject malformed rows for baseline purposes without rewriting existing file.
* Carry project destination with Codex runtime events produced by a run. When Claude poll requests are coalesced, retain every requesting project destination and write resulting snapshot to each one. Concurrent projects can therefore contain same account observation; this matches account-wide scope.
* Unavailable or malformed account snapshots create no metric row. Missing or invalid required token fields create no token row. Report read/append failures through existing desktop error reporting without failing or cancelling agent turn; later valid observations may retry.
* Hour, day, and week totals are derived by grouping `recorded_at` in UTC and summing token fields or `used_percent_delta`. CSV stores raw deltas only; no rolling aggregate rows or UI are added.
* Keep conversation usage persistence, current project/card/action totals, rate-limit bridges, and status indicators unchanged. Add desktop unit tests for schema/header creation, CSV escaping, serialized append, turn recording, provider window mapping, delta/reset rules, restart baseline recovery, duplicate suppression, malformed input, concurrent project destinations, and non-fatal I/O failure.

## acceptance criteria

* Successful Codex and Claude turns append exactly one `token_usage` record containing their normalized turn-token delta and UTC completion time.
* Changed available Codex and Claude account windows append `account_usage` records with provider, stable bucket/window identity, reset time, used percent, and correctly calculated percent delta.
* First account observation has empty delta; same-window observations use current minus previous percent; first observation after a known reset uses current percent from zero. Negative same-window corrections remain visible.
* Restarting desktop restores each delta baseline from existing CSV. Repeated unchanged snapshots do not add rows.
* Grouping records by UTC hour, day, or week yields token usage and observed account-usage change for same period without double-counting token values across account windows.
* CSV is append-only, has one header, remains valid under concurrent agent runs, and exists at `<projectFolder>/usage_metrics.csv`.
* Account activity outside project may affect account rows; documentation and field naming never describe account delta as usage caused by project.
* Malformed/unavailable snapshots and CSV I/O failures do not crash, fail, or cancel agent runs. Existing conversation usage, status-bar limits, bridges, and renderer behavior remain unchanged.
