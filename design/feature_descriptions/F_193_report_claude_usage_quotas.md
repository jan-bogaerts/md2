---
author: 
id: F_193
internalId: 8a177e01-b5d4-46aa-b42f-9ba11f561b60
title: report claude usage quotas
status: ready
owner: 
affects:
agents:
  - design/activity/card__8a177e01-b5d4-46aa-b42f-9ba11f561b60.json
policy:
after: 8690b93e-98c4-486f-95b6-aacc10931a56
branch: f_193_report_claude_usage_quotas
worktree: 2
---

we are already reporting usage limits for codex in the apps status bar. we need to provide similar information from the claude cli.

**Decision (2026-08-15, claude CLI v2.1.177): capture `/usage` output.** Two approaches were spiked; see [Why not the streaming event](#why-not-the-streaming-event) for the rejected one. `/usage` won because it carries the used-percent the codex UI centers on, plus a weekly window.

`/usage` works **headless (no TTY)** by piping into the interactive REPL via stdin; EOF makes it process and exit clean (exit 0), emitting **plain text** (no TUI escape codes). Note it is **not** available in `-p`/print mode — there `/usage` is interpreted as an LLM prompt (runs a model turn, costs quota). There is no CLI subcommand/flag for usage either.

\`\`\`
echo /usage | claude
\`\`\`

Output shape:

\`\`\`
You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Aug 15, 9:49pm (Europe/Brussels)
Current week (all models): 13% used · resets Aug 16, 6:59pm (Europe/Brussels)
\`\`\`

**Field map (parse target):**

* Two windows, one line each:
  * `Current session:` → window id `five_hour`.
  * `Current week (all models):` → window id `weekly`.
* Per line: `N% used` → `usedPercent` (integer). `resets <localized datetime> (<IANA tz>)` → the reset is given in **local time + timezone**, not unix seconds. Capture the tz string; convert to unix ms for the snapshot.
* Leading `You are currently using your subscription…` line is a header — ignore.

## Current state

Codex quota path fully built. Claude path absent.

**Codex path (reference, reuse the shape):**

* `CodexStreamingAdapter` (`desktop/src/actions/agent/agent_streaming_adapter.js`) reads rate limits from the codex app-server: `account/rateLimits/read` reply plus `account/rateLimits/updated` notifications. It calls `onRuntimeEvent({ kind, observedAt, payload })`.
* `agent_runner_service.js` `handleCodexRuntimeEvent` forwards those to `CodexRuntimeService` (`desktop/src/actions/agent/codex_runtime_service.js`), which normalizes/validates and holds one account-wide snapshot in the desktop (main) process. "Snapshot" = last known limit state for the whole account, not per card.
* Snapshot crosses to the renderer over the electron bridge `window.md2CodexRuntime` (`app/src/data/electron_codex_runtime_bridge.ts`).
* Renderer `CodexRateLimitService` (`app/src/services/agents/codex_rate_limit_service.ts`) holds `{ receivedAt, snapshot, stale }`, schedules a "stale" flip at the earliest `resetsAt`. "Stale" = reset time passed, old numbers no longer trusted.
* UI: `CodexRateLimitStatus` (status-bar button) + `CodexRateLimitDetails` (popover), driven by `codexRateLimitPresentation`. Mounted in `status_bar.tsx` (desktop) and `mobile_project_status.tsx` (mobile). Shows "Codex N% used", warns at 80%, error at 100%/reached.

**Claude path today:** No claude quota reaches the renderer. No claude status-bar indicator exists. Claude runs streaming, but nothing reads usage from it.

## implementation details

Ship a **separate claude indicator** (not merged into codex). "Separate indicator" = its own status-bar control + service, sitting next to `CodexRateLimitStatus`, claude-specific wording and fields.

**Capture mechanism:** spawn a fresh `claude` REPL per poll (`echo /usage | claude`, no `-p`), out-of-band, owned by desktop. Each spawn pays session startup (hooks fire, a few seconds) — fine for a periodic poll, not high-frequency. Poll on a timer / on demand, **not** per streaming turn. This is independent of the claude streaming adapter, which stays untouched.

### Phase 1 — desktop capture

Mirror the codex wiring so the renderer path is identical in spirit.

* Add a spawner that runs `echo /usage | claude` out-of-band on a poll and parses the plain-text output per the field map above into a claude snapshot.
* Add a `ClaudeRuntimeService` (`desktop/src/actions/agent/claude_runtime_service.js`), modeled on `CodexRuntimeService`: validate/normalize the parsed snapshot, hold one account-wide claude snapshot, emit a `rateLimits` event, expose `getSnapshot`/`subscribe`, guard against out-of-order `observedAt` (older observation ignored). Do not republish an unchanged snapshot (respect granular-events rule).
* Snapshot shape is claude-native, not forced into the codex bucket model. Fields per window: window id (`five_hour`, `weekly`), `resetsAt` (unix ms; convert from the localized datetime + tz), `usedPercent` (integer). Snapshot carries `observedAt`, `available`.
* `agent_runner_service.js`: add `handleClaudeRuntimeEvent`, symmetric to `handleCodexRuntimeEvent`, forwarding to `ClaudeRuntimeService`. Inject the service like `codexRuntimeService`.

### Phase 2 — bridge to renderer

* New preload bridge `window.md2ClaudeRuntime` (`desktop/src/shell/preload.js` + `local_bridge_dispatch.js` + `main.js`), mirroring the codex runtime bridge: `getClaudeRateLimits()`, `onClaudeRateLimits(cb)`, `onConnectionChanged?`. New typed interface `app/src/data/electron_claude_runtime_bridge.ts` with a `ClaudeRateLimitSnapshot` type matching the Phase 1 shape.

### Phase 3 — renderer service + UI (separate indicator)

* `ClaudeRateLimitService` (`app/src/services/agents/claude_rate_limit_service.ts`), mirror of `CodexRateLimitService`: `{ receivedAt, snapshot, stale }`, subscribe to bridge, schedule stale flip at earliest `resetsAt`, `EventTarget` `changed` event, `register('claudeRateLimitService', this)`.
* Hook `use_claude_rate_limits.ts` via `useSyncExternalStore`, mirror of `use_codex_rate_limits.ts`.
* New `ClaudeRateLimitStatus` + `ClaudeRateLimitDetails` components (do **not** overload the codex ones). Label shows "Claude N% used" like codex; popover lists session + weekly rows with reset times.
* Mount the new component next to `CodexRateLimitStatus` in `status_bar.tsx` and `mobile_project_status.tsx`. Render nothing when no claude snapshot / stale (same null-render discipline as codex).

### Notes / constraints

* Keep claude and codex snapshots independent; both indicators can show at once when both agents have run.
* No backend service, no paid infra — parse what the local claude CLI already gives (md2 is free/OSS).
* Reset-time math and stale handling reuse the codex approach (`receivedAt + resetsAt - observedAt`, clamp ≥ 0).

## acceptance criteria

**Capture + transport**

1. A periodic out-of-band `echo /usage | claude` spawn parses both windows (`Current session:` → `five_hour`, `Current week (all models):` → `weekly`) into a normalized snapshot with `usedPercent` (integer) and `resetsAt` (unix ms, converted from the localized datetime + tz).
2. The snapshot reaches the renderer via `window.md2ClaudeRuntime` with `observedAt`, `resetsAt`, window identifier, and `usedPercent`.
3. An older observation (`observedAt` earlier than the current snapshot) is ignored; the newest wins.
4. Malformed/partial `/usage` output is rejected by normalization and never crashes the poll or the renderer.

**UI**

5. A **separate** claude usage indicator renders in the desktop status bar and the mobile project-status drawer, distinct from the codex indicator; both can show simultaneously when both agents have run.
6. Clicking/tapping the indicator opens a claude-specific details popover listing each reported window with its reset time and percent.
7. Indicator shows "Claude N% used", warns as a limit is approached and shows error styling when a limit is reached.
8. When no claude snapshot exists, or the snapshot is stale (its earliest `resetsAt` has passed), the claude indicator renders nothing — no stale numbers shown.

**Regression**

9. The existing codex indicator, its service, and its bridge are unchanged in behavior.
10. Claude streaming turns behave exactly as before; the streaming adapter is untouched.
11. `npm run typecheck` passes; new services/components have unit tests mirroring the codex equivalents.

## Why not the streaming event

Rejected approach: reading `rate_limit_event` off the live `claude -p --output-format stream-json --verbose` stream.

* Emits reliably, once per streaming turn. Full field set: `{ status, resetsAt, rateLimitType: "five_hour", overageStatus, overageDisabledReason, isUsingOverage }`. `resetsAt` is unix **seconds**.
* Rejected because it carries **no used-percent** and only the `five_hour` window ever appeared (no weekly). The indicator could show reset-time + status color only — losing the percent the codex UI centers on.
