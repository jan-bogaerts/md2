---
author: 
id: F_193
internalId: 8a177e01-b5d4-46aa-b42f-9ba11f561b60
title: report claude usage quotas
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__8a177e01-b5d4-46aa-b42f-9ba11f561b60.json#conversation=agent-1149b713-1757-4b41-9b70-8f1f24b4de99
policy:
after: 4191dc0a-7628-45bf-ada1-b1366e9f05f9
---

we are already reporting usage limits for codex in the apps status bar. we need to provide similar information from the claude cli.

options we were given:

* Claude's normal requests expose rate-limit information. For example, claude -p --output-format stream-json --verbose can emit events like:

  \`\`\`json
  {
  "type": "rate\_limit\_event",
  "rate\_limit\_info": {
  "status": "...",
  "resetsAt": 1778193600,
  "rateLimitType": "five\_hour"
  }
  }
  \`\`\`
* running claude interactive and send a `/usage` string should report something like:

  \`\`\`
  Current session
  34% used
  Resets 10:00pm

Current week (all models)
21% used
Resets Aug 10
\`\`\`



lets see which one works

## Current state

Codex quota path fully built. Claude path absent.

**Codex path (reference, reuse the shape):**

* `CodexStreamingAdapter` (`desktop/src/actions/agent/agent_streaming_adapter.js`) reads rate limits from the codex app-server: `account/rateLimits/read` reply plus `account/rateLimits/updated` notifications. It calls `onRuntimeEvent({ kind, observedAt, payload })`.
* `agent_runner_service.js` `handleCodexRuntimeEvent` forwards those to `CodexRuntimeService` (`desktop/src/actions/agent/codex_runtime_service.js`), which normalizes/validates and holds one account-wide snapshot in the desktop (main) process. "Snapshot" = last known limit state for the whole account, not per card.
* Snapshot crosses to the renderer over the electron bridge `window.md2CodexRuntime` (`app/src/data/electron_codex_runtime_bridge.ts`).
* Renderer `CodexRateLimitService` (`app/src/services/agents/codex_rate_limit_service.ts`) holds `{ receivedAt, snapshot, stale }`, schedules a "stale" flip at the earliest `resetsAt`. "Stale" = reset time passed, old numbers no longer trusted.
* UI: `CodexRateLimitStatus` (status-bar button) + `CodexRateLimitDetails` (popover), driven by `codexRateLimitPresentation`. Mounted in `status_bar.tsx` (desktop) and `mobile_project_status.tsx` (mobile). Shows "Codex N% used", warns at 80%, error at 100%/reached.

**Claude path today:**

* Claude runs streaming with `--print --verbose --output-format stream-json --include-partial-messages --input-format stream-json` (see `action_agent_executor.test.mjs`).
* `ClaudeStreamingAdapter` (`agent_claude_streaming_adapter.js`) is constructed **without** an `onRuntimeEvent` callback (`createAgentStreamingAdapter` only passes it for codex). Any `rate_limit_event` line hits the `handleMessage` fall-through and is dropped by `ignoreProtocolNoise()`.
* No claude quota reaches the renderer. No claude status-bar indicator exists.

**Unknown (why this feature spikes before committing):** which of the two options the installed claude CLI actually emits, and in what shape. Neither maps cleanly to the codex UI:

* Option 1 `rate_limit_event` payload (`status`, `resetsAt`, `rateLimitType` e.g. `five_hour`) carries **no used-percent** — a number the codex UI centers on.
* Option 2 `/usage` returns human-formatted text (percent + reset), but only from a **separate interactive** claude session, not the live streaming run.

## implementation details

Decision: **spike both options first, then finish one.** Ship a **separate claude indicator** (not merged into codex). "Separate indicator" = its own status-bar control + service, sitting next to `CodexRateLimitStatus`, claude-specific wording and fields.

### Phase 0 — spike (throwaway, decides the rest)

Goal: learn which option the installed claude CLI actually produces, and the exact JSON/text shape. Keep the app usable throughout.

* Option 1 probe: in `ClaudeStreamingAdapter.handleMessage`, log any event whose `type === 'rate_limit_event'` (raw). Run a real streaming turn, confirm whether/when the line appears and capture full field set (`status` values, `resetsAt` unit — unix seconds vs ms, `rateLimitType` values e.g. `five_hour`, weekly).
* Option 2 probe: spawn `claude` interactive out-of-band, send `/usage`, capture raw stdout. Confirm exact labels ("Current session", "Current week (all models)"), percent format, reset format ("10:00pm", "Aug 10").
* Output of the spike = a documented field map for the winning option. Pick Option 1 if it reliably emits (rides the live run, no extra process, no scraping). Fall back to Option 2 only if Option 1 is silent or lacks reset info.

Define now so "reliably emits" is testable: emits at least once per streaming turn on an authenticated account near a real limit window.

### Phase 1 — desktop capture (winning option)

Mirror the codex wiring so the renderer path is identical in spirit.

* Add a `ClaudeRuntimeService` (`desktop/src/actions/agent/claude_runtime_service.js`), modeled on `CodexRuntimeService`: validate/normalize input, hold one account-wide claude snapshot, emit a `rateLimits` event, expose `getSnapshot`/`subscribe`, guard against out-of-order `observedAt` (older observation ignored). Do not republish an unchanged snapshot (respect granular-events rule).
* Snapshot shape must be claude-native, not forced into the codex bucket model. Minimum fields per window: an identifier/label for the window (`rateLimitType` e.g. `five_hour`, weekly), `resetsAt` (store as unix ms; convert if source is seconds), plus whichever of `usedPercent` **or** `status` the winning option provides. Snapshot carries `observedAt`, `available`.
* Wire the callback: `createAgentStreamingAdapter` passes `onRuntimeEvent` to `ClaudeStreamingAdapter` (today only codex gets it). Adapter emits `{ kind: 'snapshot'|'update'|'unavailable', observedAt, payload }` on receiving `rate_limit_event` (Option 1) or parsed `/usage` (Option 2).
* `agent_runner_service.js`: add `handleClaudeRuntimeEvent`, symmetric to `handleCodexRuntimeEvent`, forwarding to `ClaudeRuntimeService`. Inject the service like `codexRuntimeService`.

### Phase 2 — bridge to renderer

* New preload bridge `window.md2ClaudeRuntime` (`desktop/src/shell/preload.js` + `local_bridge_dispatch.js` + `main.js`), mirroring the codex runtime bridge: `getClaudeRateLimits()`, `onClaudeRateLimits(cb)`, `onConnectionChanged?`. New typed interface `app/src/data/electron_claude_runtime_bridge.ts` with a `ClaudeRateLimitSnapshot` type matching the Phase 1 shape.

### Phase 3 — renderer service + UI (separate indicator)

* `ClaudeRateLimitService` (`app/src/services/agents/claude_rate_limit_service.ts`), mirror of `CodexRateLimitService`: `{ receivedAt, snapshot, stale }`, subscribe to bridge, schedule stale flip at earliest `resetsAt`, `EventTarget` `changed` event, `register('claudeRateLimitService', this)`.
* Hook `use_claude_rate_limits.ts` via `useSyncExternalStore`, mirror of `use_codex_rate_limits.ts`.
* New `ClaudeRateLimitStatus` + `ClaudeRateLimitDetails` components (do **not** overload the codex ones). Presentation depends on winning option:
  * Option 1 (no percent): status-bar label shows window state + reset, e.g. "Claude · resets 10:00pm" and, when `status` signals throttling/rejection, warning/error color. Percent omitted.
  * Option 2 (percent): label shows "Claude N% used" like codex; popover lists session + weekly rows with reset times.
* Mount the new component next to `CodexRateLimitStatus` in `status_bar.tsx` and `mobile_project_status.tsx`. Render nothing when no claude snapshot / stale (same null-render discipline as codex).

### Notes / constraints

* Keep claude and codex snapshots independent; both indicators can show at once when both agents have run.
* No backend service, no paid infra — parse what the local claude CLI already gives (md2 is free/OSS).
* Reset-time math and stale handling reuse the codex approach (`receivedAt + resetsAt - observedAt`, clamp ≥ 0).

## acceptance criteria

**Spike (Phase 0)**

1. Spike documents, for the installed claude CLI, whether Option 1 `rate_limit_event` is emitted during a normal streaming turn, and its full field set (including `resetsAt` unit and `status`/`rateLimitType` value ranges).
2. Spike documents Option 2 `/usage` raw output shape (labels, percent format, reset format).
3. A single winning option is chosen and recorded in this doc, with the field map used by later phases.

**Capture + transport**

4. When the winning source reports claude limits during a run, a normalized claude snapshot reaches the renderer via `window.md2ClaudeRuntime` with `observedAt`, `resetsAt` (unix ms), window identifier, and the available metric (`usedPercent` or `status`).
5. An older observation (`observedAt` earlier than the current snapshot) is ignored; the newest wins.
6. Malformed/partial payloads are rejected by normalization and never crash the run or the renderer.

**UI**

7. A **separate** claude usage indicator renders in the desktop status bar and the mobile project-status drawer, distinct from the codex indicator; both can show simultaneously when both agents have run.
8. Clicking/tapping the indicator opens a claude-specific details popover listing each reported window with its reset time (and percent, if Option 2).
9. Indicator uses warning styling as a limit is approached and error styling when a limit is reached/throttled (percent thresholds for Option 2; `status` signal for Option 1).
10. When no claude snapshot exists, or the snapshot is stale (its earliest `resetsAt` has passed), the claude indicator renders nothing — no stale numbers shown.

**Regression**

11. The existing codex indicator, its service, and its bridge are unchanged in behavior.
12. Claude streaming turns (messages, tools, approvals, questions, usage/token events) behave exactly as before adding the runtime-event callback.
13. `npm run typecheck` passes; new services/components have unit tests mirroring the codex equivalents.