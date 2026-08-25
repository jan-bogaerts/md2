---
author:
id: J_36
internalId: b7b584ed-ea26-43d0-917c-e75337611846
title: investigate action popup render intensity
status: ready for implementation
owner:
affects:
agents:
  - design/activity/card__b7b584ed-ea26-43d0-917c-e75337611846.json
policy:
---
The action popup renders excessively during agent streaming, while a production build has reportedly reached about 6 GB. Treat rendering and memory as separate problems until measurements prove otherwise: identify the growing process and popup update cost before choosing fixes.

## Baseline

* `desktop/src/actions/agent/agent_streaming_adapter.js` immediately forwards assistant, reasoning, plan, and command-output deltas; presentation updates are not coalesced.
* `app/src/services/actions/action_run_registry.ts` publishes new run and conversation snapshots for every streamed update.
* `ActionConversationChat` refilters all entries and rebuilds every render group whenever the conversation reference changes.
* `ActionUsageSummaryOwner` selects the complete live conversation, so text-only deltas rerender and recalculate usage.
* A popup has many independent `useActionRunSelector` subscriptions. Stable results should avoid most React renders, but every publication still evaluates every selector.
* F\_138 memoized message/event rows and narrowed broad run subscriptions. Profile the current tree to verify it still works; later completed-tool and sub-agent groups may have changed the render shape.

`Heap-20260825T114629.heaptimeline`, captured from the Vite development renderer, contains 772,230 native `PerformanceMeasure` entries retained by Blink. React 19.2 development Performance Tracks create them, explaining substantial development-only retention but not a production process reaching 6 GB.

## Goal

Reproduce and measure popup update cost and production memory growth, then make the smallest evidence-backed fixes. Preserve streaming order, transcript content, interaction state, scrolling, persisted conversations, and terminal updates.

## Investigation

### Workload

Replay the same deterministic recorded agent-event stream before and after changes, without starting an external agent. Include:

* an open idle popup;
* steady assistant-text streaming;
* reasoning and command-output bursts;
* enough completed messages and tool/sub-agent groups to expose scaling;
* run completion and popup close.

Record event count, total content size, transcript entry count, and duration. Never compare different workloads.

### Process attribution

Measure Electron main, renderer, GPU, utility, and spawned-agent processes separately. Identify which reaches the reported size. Record private memory or working set per PID at idle, during streaming, after completion, after popup close, and after garbage collection where available. Do not use Task Manager's aggregate application total as evidence.

### Performance

Capture and correlate:

1. A Chrome DevTools Performance profile of a short, representative replay in the packaged production renderer. Enable JavaScript sampling and memory counters; capture scripting, rendering, layout, paint, garbage collection, and long tasks. Disable screenshots unless needed because they add overhead.
2. A second production profile with a long existing transcript to test whether per-delta work grows with transcript size.
3. A short React DevTools Profiler recording of the same replay in a development or profiling build. Use it only for commits and "why did this render" attribution, never as the production memory baseline because development Performance Tracks distort memory.
4. Provider notifications, bridge events, `ActionRunStore.update` calls, React commits, chat renders, and active-row renders. Investigation counters may be local but must not remain in production code.

Keep large `.json`, `.heaptimeline`, and DevTools traces out of the repository. Store raw profiles as job attachments or external artifacts; summarize filenames, settings, workload, and findings here or in the activity log.

### Memory profiles

After process attribution, capture heap snapshots of the growing process after warm-up, after replay, and after completion plus popup close and garbage collection. Compare dominators and retaining paths. Classify retained growth as:

* canonical transcript data proportional to final content;
* obsolete snapshots, arrays, strings, React fibers, DOM nodes, or style objects;
* queued IPC or bridge payloads;
* Electron/main- or child-process buffers;
* development-only profiling data.

### Required answers

* Provider events and store publications per second.
* React commits per provider event.
* Components rendered by text-only, reasoning, tool, usage, status, and timer updates.
* Whether per-delta work grows with all transcript entries or only the active entry.
* Whether JavaScript, Markdown parsing, render-group construction, React reconciliation, layout, paint, scrolling, or garbage collection dominates.
* Whether memory follows final transcript size, delta count, render count, or elapsed time.
* The process and retaining owner responsible for production growth.

## Fix selection

Choose only profile-supported fixes:

* **Event frequency:** coalesce renderer presentation updates while keeping canonical desktop state and persistence complete. Immediately flush questions, approvals, errors, terminal states, and the final pending delta.
* **Broad snapshots:** expose stable primitive or focused-reference selectors at the smallest rendering boundary. Text-only deltas must not rerender usage, history, selectors, prompt controls, or popup chrome.
* **Transcript rebuilding:** preserve stable render-group references or update only the affected group. Active-entry changes must not rerender completed historical rows or collapsed groups.
* **Layout/scrolling:** reduce layout reads and scroll writes without changing stick-to-end behavior.
* **Another process/buffer:** fix its owner rather than adding React memoization.

Add no batching flags, compatibility modes, or alternate paths unless verified call sites need different behavior.

## Acceptance criteria

* Before/after production Performance profiles replay the same recording and summarize event and commit counts, main-thread and layout/paint time, and peak/retained memory per process.
* Identify the responsible production process and dominant retaining path; report development `PerformanceMeasure` retention separately.
* A text-only delta updates active transcript content without rerendering usage summary, conversation picker, agent selectors, prompt editor, completed historical messages, or collapsed completed-tool/sub-agent groups.
* If event frequency is material, burst-time visual transcript commits are bounded by the chosen presentation interval rather than provider delta count.
* After completion, retained memory is proportional to the final canonical transcript, not delta or commit count. Popup close releases popup-owned render state and observers.
* Streaming content, order, replacements, questions, approvals, usage, errors, completion, scroll anchoring, and persisted conversation output are unchanged.
* Add deterministic regression tests for the chosen state/publication boundaries and affected UI. Exclude timing-sensitive CI assertions and tests that launch agents, Electron, shells, or external programs.
* During implementation, run affected tests. Then run `npm run test:unit`, `npm run typecheck`, and `npm run lint` in `app/`; if desktop streaming changes, also run affected desktop tests and its full suite.

## See also

* `design/releases/0_1_0/F_138_reduce_action_popup_rerenders_during_streaming.md`
* `design/feature_descriptions/J_28_finishing_action_very_slow.md`
* `design/architecture/initial description/action_popup.md`
* `design/architecture/initial description/writings/running_actions.md`
* `design/architecture/architectural_decisions.md`