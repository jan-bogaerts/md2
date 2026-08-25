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

Chrome and React Developer Tools are not usable for this investigation because the Developer Tools window crashes during capture. Add profiling controls to MD² and record through Electron's main-process `contentTracing` API instead. The user will produce the profiles by operating the packaged app normally; implementation must first make those captures possible without opening Developer Tools.

## Baseline

* `desktop/src/actions/agent/agent_streaming_adapter.js` immediately forwards assistant, reasoning, plan, and command-output deltas; presentation updates are not coalesced.
* `app/src/services/actions/action_run_registry.ts` publishes new run and conversation snapshots for every streamed update.
* `ActionConversationChat` refilters all entries and rebuilds every render group whenever the conversation reference changes.
* `ActionUsageSummaryOwner` selects the complete live conversation, so text-only deltas rerender and recalculate usage.
* A popup has many independent `useActionRunSelector` subscriptions. Stable results should avoid most React renders, but every publication still evaluates every selector.
* F\_138 memoized message/event rows and narrowed broad run subscriptions. Profile the current tree to verify it still works; later completed-tool and sub-agent groups may have changed the render shape.
* Electron 43 provides main-process `contentTracing`, per-process metrics through `app.getAppMetrics()`, and renderer heap snapshots through `webContents.takeHeapSnapshot(filePath)`.
* `desktop/main.js` already owns Electron lifecycle and IPC registration. The sandboxed preload exposes named, narrow bridges; profiling must follow that boundary and must not expose `ipcRenderer`, `contentTracing`, arbitrary file paths, or arbitrary trace configuration to the renderer.
* There is no profiling bridge, capture state owner, output convention, or in-app profiling control today. Development startup also opens Developer Tools automatically, so profiling must be verified in the packaged app with Developer Tools closed.

`Heap-20260825T114629.heaptimeline`, captured from the Vite development renderer, contains 772,230 native `PerformanceMeasure` entries retained by Blink. React 19.2 development Performance Tracks create them, explaining substantial development-only retention but not a production process reaching 6 GB.

## Goal

Make the packaged Electron app able to capture targeted performance traces, process-memory samples, and renderer heap snapshots without Developer Tools. Use those artifacts to reproduce and measure popup update cost and production memory growth, then make the smallest evidence-backed fixes. Preserve streaming order, transcript content, interaction state, scrolling, persisted conversations, and terminal updates.

## Profiling support

### Main-process owner

Add one stateful desktop profiling service. It owns `idle`, `starting`, `recording`, and `stopping` state, the active capture mode, start time, output paths, process sampling, and calls to `contentTracing`. Only one trace may run in the Electron session.

Register the service after `app.whenReady()`. Integrate it with shutdown so an active trace is stopped and flushed before Electron quits. If the renderer crashes or disappears during a capture, stop and retain the trace and process samples instead of discarding them.

The service writes directly under a user-accessible `MD2 profiles` folder in `app.getPath('documents')`. Use a timestamped base name and create:

* `<timestamp>-performance-trace.json` or `<timestamp>-memory-trace.json` for Chromium trace data;
* `<timestamp>-process-metrics.json` for capture metadata and periodic process samples;
* explicitly requested `<timestamp>-renderer.heapsnapshot` files.

Do not send trace or heap-snapshot contents over IPC and do not write profiling artifacts into the repository. The metadata records app, Electron, Chromium, operating-system, capture-mode, start/end time, trace-buffer usage, renderer PID, and the PID/type/name/service name, CPU usage, working set, peak working set, and Windows private bytes returned by `app.getAppMetrics()`. Also record active spawned-agent PIDs already owned by `AgentRunnerService`; label them as external processes because `app.getAppMetrics()` does not supply their memory.

### Capture modes

Provide fixed configurations rather than accepting category lists from the renderer:

* **Performance** uses a bounded continuous buffer and the Electron `TraceConfig` categories equivalent to a Chrome Performance recording: `devtools.timeline`, its frame/stack categories, `v8.execute`, V8 CPU-profiler categories, `blink.console`, `blink.user_timing`, `latencyInfo`, and `electron`. Include JavaScript sampling; omit screenshots.
* **Memory** runs as a separate capture mode with `disabled-by-default-memory-infra`, periodic detailed memory dumps, and Electron 43's `contentTracing.enableHeapProfiling()` before recording. Document that heap profiling is experimental and that this mode has higher overhead. Do not combine it with the performance baseline.

Use named constants for buffer size, sample interval, dump interval, and buffer warning threshold. Poll `contentTracing.getTraceBufferUsage()` while recording and expose the current percentage. Continuous mode retains the newest events if the user leaves a capture running; the UI must warn when the configured buffer is at risk of overwriting the start of the workload.

### Renderer bridge and controls

Add dedicated profiling IPC channels and a `window.md2Profiling` preload bridge with only these operations:

* read current state;
* start one of the fixed capture modes;
* stop and save the active capture;
* subscribe/unsubscribe to state changes;
* take a heap snapshot of the requesting window's renderer;
* reveal the profiles folder.

Validate every request in the main process. Associate heap capture with `BrowserWindow.fromWebContents(event.sender)`; the renderer cannot select a different `webContents` or output path.

Add a desktop-only **Profiler** control beside Config in the existing application-menu Settings section. It opens a focused profiling dialog with mode selection, Start, Stop and save, Take renderer heap snapshot, and Open profiles folder. Buttons follow the normal bottom-right dialog layout. Show recording duration, trace-buffer use, output location, and in-progress state. Keep the dialog closable while recording; capture state belongs to the service, not the component. Report failures through `dialogService` and keep the last successfully saved artifact path visible.

The dialog must warn that traces and heap snapshots can contain prompts, responses, paths, and other project data and should not be shared without review.

### Trace correlation

Content tracing replaces both Chrome Performance and React Developer Tools for this investigation. Add diagnostics-gated, content-free user-timing markers at the relevant boundaries and immediately clear their browser `PerformanceEntry` objects after emission. At minimum distinguish:

* renderer receipt of an action-run bridge event;
* `ActionRunStore.update` publication;
* popup/chat, active message or event row, render-group, usage-summary, selector, prompt, and popup-chrome commits;
* popup open/close and run terminal transitions.

Markers contain only a fixed boundary name and update kind such as text, reasoning, tool, usage, status, timer, or terminal. Do not include prompt text, transcript content, project paths, IDs, or unbounded labels. Marker collection is inactive outside a trace. Use production-compatible commit probes at the smallest components; do not depend on React's development Performance Tracks or a profiling React bundle.

Record desktop provider-event and bridge-publication counts in the metrics sidecar because those boundaries are outside Blink user timing. The tracing instrumentation is diagnostic infrastructure, not a second state or event transport, and must not change publication frequency or rendering behavior.

### Affected implementation

* Add `desktop/src/diagnostics/performance_profile_service.js` as the state and file-lifecycle owner, with focused unit tests using injected Electron, filesystem, clock, and timer dependencies.
* Update `desktop/main.js` only to construct/register that service, supply the primary window and active-agent PID provider, flush it during the existing shutdown sequence, and handle renderer loss. Existing telemetry, action shutdown, and window behavior remain unchanged.
* Add fixed profiling channels to `desktop/src/shell/ipc_channels.js`; extend `desktop/src/shell/preload.js` and its tests with the narrow `md2Profiling` bridge.
* Add a read-only `AgentRunnerService` query for active child PIDs. Its only new call site is the profiling service; starting, stopping, and tracking runs keep current behavior.
* Add the typed Electron bridge, an `EventTarget`-based renderer profiling service, and a dedicated profiler dialog/component in `app/src/`. `AppMenu` only gains the desktop-only entry point; it does not own capture state.
* Add diagnostics-gated markers at the inspected action bridge, `ActionRunStore`, and smallest popup rendering boundaries. All existing callers receive unchanged state and rendering behavior when profiling is inactive.

Do not store profiling state in desktop/project configuration, add a second listener registry, or change `design/architecture/architectural_decisions.md`.

## Investigation

### Workload

The user performs the workload in a packaged production build with Developer Tools closed. Start capture immediately before the workload and stop it immediately afterward. Record enough notes in the activity log to repeat the same action, agent/model, starting transcript, prompt, duration, and visible popup state before and after a fix.

Capture separate short workloads for:

* an open idle popup;
* steady assistant-text streaming;
* reasoning and command-output bursts;
* enough completed messages and tool/sub-agent groups to expose scaling;
* run completion and popup close.

Also repeat streaming with a long existing transcript. Record event count, total content size, transcript entry count, and duration. Never compare materially different workloads. A deterministic recorded event replay may be added later if needed, but it is not required before the user can capture real use.

### Process attribution

Use the metrics sidecar to measure Electron main, renderer, GPU, and utility processes separately and identify which grows. Record private bytes and working set per PID at idle, during streaming, after completion, and after popup close. Correlate spawned-agent PIDs separately; do not use Task Manager's aggregate application total as evidence.

### Performance

Capture and correlate:

1. A short **Performance** content trace of representative streaming in the packaged renderer.
2. A second Performance trace with a long existing transcript to test whether per-update work grows with transcript size.
3. A **Memory** content trace of the reported growth scenario, captured separately because its overhead differs.
4. Provider notifications, bridge events, `ActionRunStore.update` publications, targeted component commits, scripting, rendering, layout, paint, garbage collection, and long tasks using the fixed trace markers and metrics sidecar.

Inspect traces in Perfetto or Chrome's trace viewer after capture; opening a trace viewer is not part of the MD² process being measured. Keep large `.json`, `.heapsnapshot`, and trace files out of the repository. Store raw profiles as job attachments or external artifacts; summarize filenames, settings, workload, and findings here or in the activity log.

### Memory profiles

After process attribution, use the in-app control to capture renderer heap snapshots after warm-up, after the workload, and after completion plus popup close. A main-process heap snapshot may be added only if process metrics identify the main process as the owner. Do not require Developer Tools or exposed garbage collection. Compare dominators and retaining paths. Classify retained growth as:

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

Do not implement a rendering or memory fix as part of profiling-support work. Wait for the user's captured artifacts and recorded workload notes, document the evidence, then choose only profile-supported fixes:

* **Event frequency:** coalesce renderer presentation updates while keeping canonical desktop state and persistence complete. Immediately flush questions, approvals, errors, terminal states, and the final pending delta.
* **Broad snapshots:** expose stable primitive or focused-reference selectors at the smallest rendering boundary. Text-only deltas must not rerender usage, history, selectors, prompt controls, or popup chrome.
* **Transcript rebuilding:** preserve stable render-group references or update only the affected group. Active-entry changes must not rerender completed historical rows or collapsed groups.
* **Layout/scrolling:** reduce layout reads and scroll writes without changing stick-to-end behavior.
* **Another process/buffer:** fix its owner rather than adding React memoization.

Add no batching flags, compatibility modes, or alternate paths unless verified call sites need different behavior.

## Acceptance criteria

### Capture readiness

* A packaged Electron build can start and stop fixed Performance and Memory `contentTracing` captures from the app while Developer Tools remains closed.
* Stopping produces a trace and metrics sidecar in the displayed profiles folder; quitting or renderer failure during capture makes a best effort to flush the active trace.
* Process metrics distinguish Electron main, renderer, GPU, and utility processes by PID and record active spawned-agent PIDs as external metadata.
* The app can take a heap snapshot of the requesting renderer without Developer Tools.
* Only one trace can run, invalid transitions fail clearly, buffer use and duration update while recording, and no arbitrary trace options, file paths, Electron objects, or IPC primitives cross the preload boundary.
* Trace markers and counters are inactive when no capture is running, contain no content or project identifiers, and do not retain unbounded `PerformanceEntry` data.
* Focused desktop service, IPC, preload, renderer bridge/service, dialog, shutdown, and failure-path tests pass. Tests mock Electron APIs and file output; they do not launch Electron or create real traces or heap snapshots.

### Investigation and fixes

* Before/after production content traces use comparable recorded workloads and summarize event/publication/commit counts, main-thread and layout/paint time, and peak/retained memory per process.
* Identify the responsible production process and dominant retaining path; report development `PerformanceMeasure` retention separately and do not use development memory as the production baseline.
* A text-only delta updates active transcript content without rerendering usage summary, conversation picker, agent selectors, prompt editor, completed historical messages, or collapsed completed-tool/sub-agent groups.
* If event frequency is material, burst-time visual transcript commits are bounded by the chosen presentation interval rather than provider delta count.
* After completion, retained memory is proportional to the final canonical transcript, not delta or commit count. Popup close releases popup-owned render state and observers.
* Streaming content, order, replacements, questions, approvals, usage, errors, completion, scroll anchoring, and persisted conversation output are unchanged.
* Add deterministic regression tests for the chosen state/publication boundaries and affected UI. Exclude timing-sensitive CI assertions and tests that launch agents, Electron, shells, or external programs.
* During profiling-support implementation, run affected tests, then `npm run test:unit`, `npm run typecheck`, and `npm run lint` in `app/`, plus affected desktop tests, `npm run test:full`, and `npm run lint` in `desktop/`. Repeat the proportional checks for later profile-supported fixes.

## See also

* `design/releases/0_1_0/F_138_reduce_action_popup_rerenders_during_streaming.md`
* `design/feature_descriptions/J_28_finishing_action_very_slow.md`
* `design/architecture/initial description/action_popup.md`
* `design/architecture/initial description/writings/running_actions.md`
* `design/architecture/architectural_decisions.md`
* [Electron `contentTracing`](https://www.electronjs.org/docs/latest/api/content-tracing/)
* [Electron `TraceConfig`](https://www.electronjs.org/docs/latest/api/structures/trace-config/)
* [Electron process metrics](https://www.electronjs.org/docs/latest/api/structures/process-metric/)
* [Electron `webContents.takeHeapSnapshot`](https://www.electronjs.org/docs/latest/api/web-contents/#contentstakeheapsnapshotfilepath)
