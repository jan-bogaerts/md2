---
id: B-066
title: running actions contract gaps after F-047
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 8fa439c4-bc78-42dd-9d7c-f488092e993b
---

## Problem

The F-047 implementation delivers one Electron action runner with correct chain, `okButNotAfter`, and cancellation semantics, but an audit against `design/architecture/initial description/writings/running_actions.md` found 17 contract gaps. This report lists each gap with the exact location, expected behavior, and fix direction so they can be resolved without re-deriving the analysis.

Decisions already taken for this report:

- Command runs must always write history, not only when a commit line is detected (finding 12 is a bug).
- Conversation continuation goes through the Electron action runner via an extended start request, not a fake action id (finding 4).
- Free-prompt agent chat from the conversation panel routes through the builtin `md2.custom-prompt` action (finding 4b).

## Findings

### 1. Card `currentAction` execution state is not implemented (missing, high)

Contract ("Card execution state"): a card keeps an in-memory `currentAction` while an action runs for it; every action entry point for that card is disabled while set; completion, failure, or cancellation clears it and publishes an execution-state event; nothing is persisted.

Current state: no `currentAction` exists anywhere in `app/src`. `app/src/components/actions/action_entry_points.tsx` never disables entry points. The running dot in `app/src/components/card_view/project_card_view.tsx` (line ~57, `isAgentRunning`) derives from `card.agentConversations` status only, so command actions show no running state and a second run can start while one is active.

Fix direction: derive a renderer-side map `cardPath -> executionId` from the shared `onActionExecution` stream (subscribe once, e.g. in `AgentIntegration` or a small dedicated service). Set the entry on the root `execution`/`running` event, clear on terminal events (`completed`, `failed`, `cancelled`, `okButNotAfter`). Requires the event to carry `context` (finding 2) so the card path is known. Disable all `ActionEntryPoints` variants and the popup `Run`/`Schedule` buttons for that card while set. On app start the map is empty by construction. Cover with React tests: entry points disabled during run, re-enabled after each terminal status.

### 2. Execution events do not carry `context` (missing, high)

Acceptance: "Every execution event identifies the root action, current action, context, phase, and execution status."

Current state: `emit` in `desktop/src/actions/action_runner_service.js` (`emit(execution, action, phase, status, details)`, ~line 484) publishes `actionId`, `executionId`, `phase`, `rootActionId`, `status` plus details — no `context`. `ActionExecutionEvent` in `app/src/data/action_run_types.ts` has no `context` field.

Fix direction: add `context: execution.context` to the emitted event object and `context: ActionContext` to `ActionExecutionEvent`. Extend `desktop/src/actions/action_runner_service.test.mjs` event assertions. Finding 1 depends on this.

### 3. Web mode does not disable execution controls with an explanation (missing, high)

Contract ("Availability and errors"): run, cancel, and live-input controls are disabled with a clear explanation when no Electron execution backend is available; definitions stay editable.

Current state: popup `Run` (`app/src/components/actions/action_popup.tsx`) is always enabled; without a bridge, `runElectronAction` throws `Action execution requires Electron` (`app/src/services/electron_action_runner.ts` line ~59) which renders as a failed run log only after clicking. Panel `Start`/`Continue`/`Send` in `app/src/components/agents/agent_conversation_list.tsx` behave the same via thrown errors.

Fix direction: expose a `hasExecutionBackend` check (bridge presence, `getElectronActionBridge() !== null`; a remote-control browser session still counts as available because it proxies to Electron). Disable `Run`, `Cancel`, `Schedule`, panel `Start`/`Continue`/`Send` and show helper text such as "Action execution requires the Electron desktop app". Add React tests for the disabled state and explanation.

### 4. Conversation continuation bypasses the Electron action runner (missing, high)

Contract/F-047: manual, `onState`, scheduled, related, and continuation runs all use the one Electron runner; the conversational panel continuation "starts or resumes a linked Electron agent run".

Current state: `continueConversation` in `app/src/services/agent_conversation_service.ts` (lines 160-186) loads the source conversation in the renderer, builds the continue prompt itself (`buildContinuePrompt`), and calls the raw `storage.startAgentConversation` bridge (`desktop/src/shell/local_bridge_dispatch.js` lines 181-185). No execution id, no chain semantics, no shared execution events, no card execution state.

Fix direction (decided): extend the runner start request with an optional continuation field, e.g. `runInput.continueFrom: <conversation reference>` (add to `ALLOWED_RUN_INPUT_FIELDS` in `desktop/src/actions/action_runner_service.js`). Electron loads the source conversation by reference, resolves `nativeSessionId`, builds the resume command via `buildResumeAgentCommand` (or the continue prompt fallback currently in the renderer — move `buildContinuePrompt` to Electron), and runs it as an agent action execution with normal events, history, and cancellation. The panel `Continue` button then calls `runElectronAction` with the action id the conversation belongs to (persist the originating action id in the conversation log so continuation can find it; conversations started before this change can fall back to `md2.custom-prompt`). Remove the renderer-side prompt building. The `startAgentConversation` bridge remains only for the search-regexp agent unless finding 4b removes the last other caller.

### 4b. Free-prompt panel chat bypasses the runner (missing, medium)

`startAgentConversation` in `app/src/services/agent_integration.ts` (line 163) and `AgentConversationList` `Start` run a raw agent process outside the runner.

Fix direction (decided): route panel `Start` through `runElectronAction(BUILTIN_CUSTOM_PROMPT, fileContext, { extraPrompt: prompt })`. The runner already resolves `md2.custom-prompt` (it is in the definition registry from `shared/action_definitions.mjs`). Delete `AgentIntegration.startAgentConversation` and `AgentConversationService.startConversation` once no caller remains.

### 5. Run popup ignores agent executable availability (missing, medium)

Contract ("Execution flow"): on app start, check whether the supported Codex and Claude executables are available and enable or disable them accordingly, with a clear explanation.

Current state: availability is only consulted in the action editor (`app/src/components/actions/action_agent_capability_fields.tsx` via `agentCapabilitiesService`). The run popup agent select (`app/src/components/actions/action_agent_form.tsx`) lists `mergeAgentProfiles(...)` without availability, so an unavailable agent is selectable and fails only at process spawn. The check is also lazy (first editor open), not at app start.

Fix direction: load availability once at startup (e.g. in app bootstrap when the Electron bridge exists) into `agentCapabilitiesService`; reuse `useAgentCapabilities` in `use_action_popup_controller.ts`/`ActionAgentForm` to disable unavailable profiles in the run popup with the same `name — error` labeling the editor uses. Disable `Run` when the selected agent is unavailable.

### 6. Conversation panel lacks popup parity (missing, medium)

Contract ("Conversational panel"): the panel shows the active action execution and the same action history available in the popup; command actions show their execution status and log without agent chat controls.

Current state: `app/src/components/agents/agent_conversation_list.tsx` renders persisted agent conversations only. No action history, and command-action executions are invisible in the panel.

Fix direction: for the active card/file, render (a) the live execution (from the shared event stream / finding 1 state) including command actions with status and log text, and (b) the action run history loaded through the same `loadActionHistory` path the popup uses (`app/src/services/action_history.ts`, `app/src/components/actions/action_run_history.tsx` can be reused). Keep chat input controls only for running agent executions.

### 7. `sendActionInput` bridge is dead code; stdin uses the legacy path (incorrect, medium)

`sendActionInput(executionId, input)` is wired end to end (`desktop/src/shell/local_bridge_dispatch.js` lines 236-240, preload, remote control) but has no production caller. The panel sends input via `sendAgentInput(conversation.id, input)` — this works only because agent run ids equal conversation ids in `desktop/src/actions/agent_runner_service.js`.

Fix direction: make the panel input for a running action execution call `sendActionInput(executionId, input)` (execution id available once findings 1/6 track live executions). Keep `sendAgentInput` only while a non-runner agent path exists; after findings 4/4b it should be removable. One stdin path at the end.

### 8. Popup run state is local component state, not the shared live execution state (incorrect, high)

Contract: the popup and conversational panel use the same live execution state; running state remains visible.

Current state: `use_action_popup_controller.ts` keeps `runStatus`/`runResult`/`executionId` in `useState` and gets results from the `runElectronAction` promise. Closing the popup mid-run and reopening shows `idle`; `Cancel` is gone; the run continues with no way to reattach.

Fix direction: keep a renderer-wide live-execution store fed by one `onActionExecution` subscription (same store as findings 1/6): `executionId -> { rootActionId, context, status, logs }`. The popup controller selects the entry matching its action id + context on mount, so reopening reattaches to a running or recently finished execution. `runElectronAction`'s per-call subscription can then be replaced by reads from that store (it currently also races: it subscribes before `startAction` resolves and buffers events, a per-call mechanism the store makes unnecessary).

### 9. No live log streaming in the popup (incorrect, medium)

`runElectronAction` (`app/src/services/electron_action_runner.ts` lines 82-84) ignores `running` events, which carry the streamed stdout/stderr chunks from `emit(..., 'running', { stdout, stderr, ... })` in the runner. Logs appear only when a phase ends. Streamed command output currently has no live consumer anywhere in the UI.

Fix direction: with the store from finding 8, append `running`-event chunks to the execution's live log and render them in the popup log area (and panel, finding 6) while status is `running`. Keep the final phase event as the authoritative complete output.

### 10. Global indicator double-counts agent actions (incorrect, medium)

`app/src/services/agent_integration.ts` `handleActionExecutionEvent` (lines 295-330): the root `execution`/`running` event adds a running-agent entry `Action <rootActionId>` via `startRunningAgent`, and every embedded `agentEvent` with type `started` adds a second entry via `agentConversationService.observeRunEvent`. One agent action produces two indicator entries; command actions produce one.

Fix direction: one entry per execution. Keep the execution-event entry (works for command and agent actions) and stop calling `observeRunEvent` for agent events that belong to an action execution (they carry `event.executionId`). `observeRunEvent` remains for the non-runner paths until findings 4/4b remove them.

### 11. Cancelled phases are logged as failed in the popup (incorrect, low)

`logFromEvent` in `app/src/services/electron_action_runner.ts` (line 44) maps every non-`completed` status to `failed`, so a `cancelled` action event shows as "failed" in the popup log.

Fix direction: preserve the actual status (`cancelled` stays `cancelled`); widen `ActionRunLogEntry.status` accordingly and adjust rendering/colors.

### 12. Command runs without a commit line write no history (bug, medium — decided)

`appendCommandHistory` in `desktop/src/actions/action_runner_service.js` (lines 468-476) returns early when `extractCommitMetadata` finds no `[branch hash]` line, so ordinary command runs leave no history although acceptance requires history keyed by action id and context.

Fix direction: always append an entry `{ command, completedAt, output, prompt: '', status }` and include `commit` metadata only when present (mirroring the agent-action entry shape a few lines above). Update runner tests: command run without commit line produces a history entry.

### 13. Remarkable builtin action is hardcoded inside the runner (design, medium)

`REMARKABLE_CONVERT_ACTION` (`desktop/src/actions/action_runner_service.js` lines 15-36) is special-cased in `loadRootAction` by id. `loadRequestAction` in `desktop/src/shell/local_bridge_dispatch.js` (lines 48-65) does not know it, so `loadActionRunHistory` for `md2.convert-remarkable-images-to-text` throws `Unknown action` (latent — no UI currently opens history for it, but the runner writes history entries for it that can never be read back).

Fix direction: move the definition into `shared/action_definitions.mjs` as a builtin next to `BUILTIN_CUSTOM_PROMPT` and include it in the registry/actions list returned by `validateActionDefinitionGraph` (with duplicate-id protection like the custom prompt). Delete the runner special case; both `loadRootAction` and `loadRequestAction` then resolve it naturally. Keep it out of entry-point listings via its `appliesTo`/`builtin` handling in the renderer (verify `actionsForContext` filtering).

### 14. Duplicate definition-loading logic in desktop main (design, medium)

`ActionRunnerService.loadRootAction` and `local_bridge_dispatch.loadRequestAction` both load action files, validate with `loadActionDefinitions`, sanitize errors, and find by id — with drift already (builtin handling differs; dispatch requires the renderer to send `actionsFolder`, the runner owns its own from `startProject`).

Fix direction: extract one resolver (e.g. `desktop/src/actions/action_definition_resolver.js`) taking `(localGitService, project, actionsFolder, profiles, actionId)` and use it from both call sites. Prefer the runner's owned `actionsFolder` for history requests too, so the renderer stops sending it (`ActionRunHistoryRequest`), tightening the Electron boundary.

### 15. `extractCommitMetadata`/`COMMIT_LINE_PATTERN` duplicated across processes (design, low)

Identical logic exists in `desktop/src/actions/action_runner_service.js` (lines 10, 115-129) and `app/src/services/action_history.ts` (lines 11-38). They will drift.

Fix direction: move the pattern and parser into `shared/` (like `shared/agent_profiles.mjs`) and import from both sides; keep the small input-shape differences (`project.rootPath` requirement) at the call sites. Check whether the renderer copy still has callers after findings 4/4b — if not, delete it instead.

### 16. `okButNotAfter` has no distinct presentation (design, low)

`statusColor` in `app/src/components/actions/action_popup_defaults.ts` (lines 64-70) falls through to `text.secondary` for `okButNotAfter`; the state is distinguishable only by its raw text. The panel/conversation chips (`agent_conversation_list.tsx` `statusColor`) have no such state at all.

Fix direction: give `okButNotAfter` an explicit color (warning.main) and a human label ("Completed, after-actions failed") wherever run status renders (popup status, history entries, panel once finding 6 lands).

### 17. `onState` trigger detection lives in the renderer (design, documented limitation)

`triggerStateActions` in `app/src/services/agent_integration.ts` (lines 227-237) detects card state changes and calls `runElectronAction`, so execution is Electron-owned (acceptance met) but triggering only happens while the app runs with a loaded snapshot; a state change written by an external process fires nothing.

Fix direction: no code change required by the contract. Record it as an accepted limitation in `running_actions.md` ("Application-level triggers") — note: modifying that architecture document needs explicit approval first. If instead triggers should move to Electron, that is a separate feature (Electron would need card-state diffing on `watchProject` events).

## Suggested fix order

1. Finding 2 (event `context`) — small, unblocks 1, 6, 8.
2. Findings 8 + 9 + 1 — one shared live-execution store in the renderer feeds popup reattach, live logs, and card `currentAction`.
3. Findings 3, 5 — availability/backend gating in popup and panel.
4. Findings 12, 11, 16 — small correctness/presentation fixes, independent.
5. Findings 4, 4b, 7, 10 — continuation and free chat through the runner, then collapse stdin paths and indicator double-count (10's guard can land earlier using `executionId` presence).
6. Findings 13, 14, 15 — desktop-side refactors, independent of the UI work.
7. Finding 17 — documentation only, needs doc-change approval.

## Test plan

- Desktop: runner emits `context` on every event; command run without commit line writes history; continuation request resolves resume command in Electron and rejects an unknown conversation reference; remarkable builtin resolvable by both runner and history loader; shared resolver unit tests.
- React: entry points and popup controls disabled while a card runs and re-enabled per terminal status; popup reattaches to a running execution after reopen; live log chunks render while running; cancelled phase shows cancelled; web mode shows disabled controls with explanation; run popup disables unavailable agents; indicator shows exactly one entry per running execution; panel shows command execution status and popup-equivalent history; panel input routes through `sendActionInput`.
- Run `npm run lint` and `npm run test` in `app/` and `desktop/`, plus `npm run typecheck` in `app/`.

## See also

- `design/architecture/initial description/writings/running_actions.md`
- `design/feature_descriptions/F_047_running_actions_and_agents.md`
- `design/feature_descriptions/B_050_action_execution_still_has_two_orchestrators.md`
