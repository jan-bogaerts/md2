---
author: 
id: F_442
internalId: 4a06c2b1-a7db-4f8f-a995-f638b14e6962
title: scope agent catalogs and runtime usage by account
status: ready
owner: 
affects:
agents:
  - design/activity/card__4a06c2b1-a7db-4f8f-a995-f638b14e6962.json
policy:
after: ad646cb9-3521-4a35-ae1b-7fdaa2701547
changedFiles:
  - app/src/components/hooks/use_agent_model_catalog.ts
  - app/src/data/agent_model_catalog.ts
  - app/src/services/agents/agent_capabilities_service.ts
  - app/src/services/agents/claude_rate_limit_service.ts
  - app/src/services/agents/codex_rate_limit_service.ts
  - desktop/src/actions/agent/agent_runtime_usage.js
  - desktop/src/actions/agent/agent_usage_poll_context.js
  - desktop/src/actions/agent/agent_usage_poll_service.js
  - desktop/src/actions/agent/agent_usage_poll_service.test.mjs
  - desktop/src/shell/local_bridge_dispatch.js
---

Isolate model discovery and live provider usage snapshots by agent account. Persisted usage metrics and account-reset schedules are handled in F_443.

## Current state

* `AgentModelCatalogService` caches one catalog per agent and publishes catalog events keyed only by agent.
* `useAgentModelCatalog` and local/remote bridge subscriptions also identify catalogs by agent profile.
* `CodexRuntimeService` and `ClaudeRuntimeService` each own one latest rate-limit snapshot.
* `AgentRunnerService` owns one provider usage refresh context, so polling always uses the inherited desktop environment.
* The toolbar consumes the single provider snapshot.

## Implementation details

* Key model-catalog loads, cache entries, bridge requests/events, remote-control messages, renderer service snapshots, and subscriptions by `(agent, resolved accountId)`.
* Run model discovery with the selected account environment from F_440. A missing account ID means the agent's initial account.
* Changing the selected account must load or reuse only that account's catalog. A catalog failure or login requirement for one account must not mark another account's catalog unavailable.
* Change Codex and Claude runtime services from one provider snapshot to snapshots keyed by account ID. Runtime events must carry the account that produced them.
* Replace the single usage-poll state with a finite collection of poll contexts keyed by `(agent, accountId)`. Each context uses that account's resolved process environment.
* Start contexts only for configured built-in accounts that need observation. Stop and dispose them on project switch, account removal, or application shutdown. Keep the collection bounded by the configured account list; do not use unbounded retry or drain loops.
* Route runtime events and process-emitted rate-limit updates to the matching account snapshot. A failed or interactive login state affects only that account.
* The toolbar shows the selected default account's snapshot. Account selectors and other live consumers request the snapshot matching their selected account.
* Keep current `EventTarget` and `useSyncExternalStore` patterns with granular account-scoped events and stable snapshots.
* Do not change `usage_metrics.csv` or reset-schedule persistence in this task.
* Add focused catalog, bridge, renderer-hook, poller, runtime-service, lifecycle-stop, and toolbar tests.

## Acceptance criteria

* Model catalogs for two accounts of the same provider are cached, refreshed, published, and displayed independently.
* Model discovery and usage polling use the matching account's configuration directory.
* Codex and Claude runtime snapshots are addressable by account and cannot overwrite another account's state.
* The toolbar follows the selected default account without republishing unrelated account snapshots.
* Poll contexts stop on project switch, account removal, and application shutdown and remain bounded by configured accounts.
* Login or polling failure for one account leaves other accounts' catalogs and snapshots available.

