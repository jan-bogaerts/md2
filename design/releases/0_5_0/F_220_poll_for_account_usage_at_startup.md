---
author: 
id: F_220
internalId: 2740ca78-6f46-4297-8adb-ee047283f48d
title: poll for account usage at startup
status: ready
owner: 
affects:
agents:
  - design/releases/V_0_5_0/card__2740ca78-6f46-4297-8adb-ee047283f48d.json
policy:
after: 9500eb58-7f00-49e3-8961-0303cda178ab
---

## Current state

Renderer startup starts `ClaudeRateLimitService` and `CodexRateLimitService`. Each service reads any snapshot already held by desktop runtime and subscribes to later changes, but neither service asks provider for fresh account usage.

Desktop runtime initially has no snapshot. Claude polling starts only when `AgentRunnerService` starts Claude run, then repeats while Claude run remains active. Codex sends `account/rateLimits/read` while Codex app-server initializes for run. Therefore both account-usage indicators remain empty after application launch until corresponding agent runs.

Existing Claude and Codex runtime services, renderer bridges, validation, stale-state handling, status components, and usage-detail components already support startup result. No UI change needed.

## implementation details

- Start one non-blocking account-usage refresh when Electron becomes ready, before creating renderer window. **Non-blocking** means window creation does not await provider process, timeout, or result.
- Read configured `claude` and `codex` profiles once for startup refresh. Use `AgentExecutableResolver` and `createAgentEnvironment` so startup uses same executable resolution and sanitized process environment as normal runs. Account usage is account-wide, so refresh must not require loaded project.
- Reuse `ClaudeUsagePoller` for Claude. Resolve configured Claude executable, request one poll, and keep existing `/usage` parsing, terminal fallback, cooldown, timeout, snapshot normalization, and unavailable result.
- Add dedicated one-shot Codex usage poller. Start configured Codex command in `app-server --stdio` mode, send `initialize`, send `initialized` after successful initialization, then send `account/rateLimits/read`. Publish returned rate-limit payload without starting thread or turn. Stop process after response, protocol failure, process exit, or timeout.
- Let `AgentRunnerService` own and stop both pollers. Route successful startup results into existing `ClaudeRuntimeService` or `CodexRuntimeService`; route conclusive failures into existing unavailable snapshots. Startup refresh must not write project usage metrics because no project owns startup observation. Provider-run observations keep existing metrics behavior.
- Missing provider profile or executable must not fail application startup. Missing profile skips that provider; missing executable, malformed output, protocol error, exit, or timeout produces provider unavailable state and cleans child process.
- Keep existing run-triggered Claude polls, active-run polling, Codex protocol updates, runtime bridges, renderer services, and UI behavior. Newer observations continue to replace older observations by `observedAt`.
- Add tests for startup orchestration, missing profiles and executables, non-blocking launch, Claude poll reuse, Codex initialize/read protocol, no Codex thread or turn, timeout/process cleanup, unavailable results, shutdown, and observation ordering.

## acceptance criteria

- On fresh Electron launch with authenticated Claude and Codex CLIs, account usage becomes visible without user starting agent or loading project.
- Startup requests each configured built-in provider at most once. Window opens without waiting for either provider.
- Claude startup refresh uses existing `/usage` poll and publishes same validated snapshot shape as run-triggered Claude poll.
- Codex startup refresh reads `account/rateLimits/read` through app-server without creating thread, starting turn, or sending prompt.
- Successful startup snapshots reach existing local and remote subscribers through current runtime bridges. Later provider observations replace older startup snapshots.
- Missing configuration, unavailable executable, malformed response, provider error, process exit, or timeout does not block startup or show account usage as current. Started child process is terminated.
- Startup refresh writes no project usage-metrics row. Later run-triggered usage collection and metrics recording remain unchanged.
- Application shutdown stops pending startup polls. Focused desktop tests, app unit tests, and lint pass.
