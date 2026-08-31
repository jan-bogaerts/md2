---
author: 
id: F_227
internalId: 269f5e9f-dbe4-4818-bd5a-7915bba398af
title: remove GPT-5-3-Codex-Spark from account usage
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__269f5e9f-dbe4-4818-bd5a-7915bba398af.json
policy:
after: 93f10274-10fd-48a2-9c07-bf50b9f970c8
---
for codex, we currently still show account usage for `GPT-5.3-Codex-Spark` . we don't support this model in the app, so no need to show account usage for this, also no need to track it. in fact, this may be removed everywhere that it might be used in code (ex: charts)

## Current state

Codex returns one or more rate-limit buckets. `CodexRuntimeService` normalizes every valid bucket and publishes all of them. Each bucket has a machine-facing `limitId` and a user-facing `limitName`; `CodexRateLimitDetails` displays `limitName`, so `GPT-5.3-Codex-Spark` is the known name, while its `limitId` is not known from the UI or repository.

`codexRateLimitPresentation` includes every bucket containing a primary or secondary usage window. After `AgentRunnerService` publishes a Codex snapshot, it passes that complete snapshot to `UsageMetricsService`, which writes every bucket window to `usage_metrics.csv`. Stats later group those rows by provider, `limitId`, and window. No model-specific exclusion exists, so Spark can appear in current account limits and can create future chart data.

## implementation details

* Define `GPT-5.3-Codex-Spark` as an excluded Codex rate-limit name in `codex_runtime_service.js`. Match exact `limitName`; do not guess or hardcode an unknown `limitId`.
* Remove matching buckets while `CodexRuntimeService` normalizes both full `account/rateLimits/read` results and sparse `account/rateLimits/updated` events. A **sparse update** contains only changed fields or buckets. Full snapshots replace supported buckets; sparse updates merge only supported buckets and must never add Spark back.
* Publish and persist remaining Codex buckets normally. Filtering at this desktop ingestion boundary keeps Spark out of renderer snapshots, status details, remote transport, and all future `usage_metrics.csv` rows without duplicate UI or stats filters.
* Keep reset-credit data, other Codex limits, unavailable handling, stale-state behavior, polling, WebSocket transport, and token-usage tracking unchanged.
* Do not rewrite or delete existing `usage_metrics.csv` history. Its account rows contain `limitId` but not `limitName`, so old Spark rows cannot be identified safely without the provider's actual ID. No matching historical ID is known in the repository.
* Add runtime tests for mixed full snapshots, Spark-only full snapshots, and sparse Spark updates. Extend runner metrics coverage to prove persisted Codex snapshots contain only supported buckets. Existing UI and stats tests remain unchanged because they consume the filtered snapshot and recorded rows.

## acceptance criteria

* When Codex returns `GPT-5.3-Codex-Spark` beside supported rate-limit buckets, published snapshots contain only supported buckets.
* When Codex returns only `GPT-5.3-Codex-Spark`, current Codex account usage does not display Spark or stale supported-bucket values.
* A sparse Spark update does not add Spark, change supported buckets, or create a Spark account-usage row.
* Desktop and mobile account-limit details, remote clients, and newly recorded stats data never receive `GPT-5.3-Codex-Spark`.
* Supported Codex buckets still display, update, travel through remote transport, and produce account-usage metrics as before.
* Existing metrics files are not migrated or deleted. Token-usage metrics and Claude account usage remain unchanged.
* Focused Codex runtime and agent-runner tests pass; desktop lint and unit tests pass.
