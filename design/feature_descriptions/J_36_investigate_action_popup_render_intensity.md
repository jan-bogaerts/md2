---
author:
id: J_36
internalId: b7b584ed-ea26-43d0-917c-e75337611846
title: investigate action popup render intensity
status: design
owner:
affects:
agents:
  - design/activity/card__b7b584ed-ea26-43d0-917c-e75337611846.json
policy:
---
The action popup performs excessive rendering while an agent streams. Development heap analysis found very large numbers of retained React performance entries, and a production build has reportedly grown to about 6 GB. Do not assume these have one cause: determine which process owns the production memory and why the popup renders so much before selecting a fix.

## Current implementation

* `desktop/src/actions/agent/agent_streaming_adapter.js` forwards assistant, reasoning, plan, and command-output deltas immediately. There is no presentation-rate coalescing.
* `app/src/services/actions/action_run_registry.ts` publishes a new run and conversation snapshot for each streamed update.
* `ActionConversationChat` filters the complete entry list and rebuilds all render groups whenever the conversation reference changes.
* `ActionUsageSummaryOwner` selects the complete live conversation, so text-only deltas also rerender and recalculate the usage summary.
* One popup creates many independent `useActionRunSelector` subscriptions. Stable selector results should prevent most React renders, but every store publication still evaluates every selector.
* F\_138 already memoized individual message and event rows and narrowed earlier broad run subscriptions. Verify that optimization still works; do not repeat its assumptions without profiling the current component tree. Completed-tool and sub-agent groups were added later and may have changed the render shape.

The supplied `Heap-20260825T114629.heaptimeline` was captured from the Vite development renderer. It contains 772,230 native `PerformanceMeasure` entries retained by Blink, but React 19.2 development Performance Tracks create these entries. This explains substantial development-only retention, not a production process reaching 6 GB.

## Goal

Produce a reproducible, measured explanation of the popup's update cost and production memory growth, then implement the smallest fixes supported by the evidence. Preserve streaming order, transcript content, interaction state, scroll behavior, persisted conversations, and terminal updates.

## Required investigation

### Reproducible workload

Create or reuse a deterministic recorded agent-event stream so the same workload can be replayed before and after changes without starting an external agent. Include:

* an open idle popup;
* steady assistant-text streaming;
* reasoning and command-output bursts;
* a transcript with enough completed messages and tool/sub-agent groups to expose scaling behavior;
* run completion and popup close.

Record the event count, total content size, transcript entry count, and test duration. Do not compare profiles from different workloads.

### Process attribution

Measure Electron main, renderer, GPU, utility, and spawned agent processes separately. Identify which process reaches the reported memory size. Record private memory or working set per PID at idle, during streaming, after completion, after popup close, and after garbage collection where available. Aggregate Task Manager's application total is not sufficient evidence.

### Performance profiles

A performance profile is required.

1. Capture a Chrome DevTools Performance profile from the packaged production renderer during a short, representative replay. Enable JavaScript sampling and memory counters. Capture scripting, rendering, layout, paint, garbage collection, and long tasks. Keep screenshots disabled unless they are needed because they add overhead.
2. Capture a second production profile with a long existing transcript to show whether per-delta work grows with transcript size.
3. Capture a short React DevTools Profiler recording using the same replay in a development or profiling build. Use it only to attribute commits and "why did this render" results; React development Performance Tracks distort memory and must not be used as the production memory baseline.
4. Correlate provider notifications, bridge events, `ActionRunStore.update` calls, React commits, chat renders, and active-row renders. Temporary local counters are allowed for investigation but must not remain in production code.

Do not commit large `.json`, `.heaptimeline`, or DevTools trace files. Keep the raw profiles as job attachments or external artifacts and summarize their filenames, capture settings, workload, and findings in this document or its activity log.

### Memory profiles

After process attribution, capture heap snapshots for the process that grows: one after warm-up, one after the replay, and one after completion and popup close followed by garbage collection. Compare dominators and retaining paths. Retained growth should be classified as one of:

* canonical transcript data proportional to final transcript content;
* obsolete snapshots, arrays, strings, React fibers, DOM nodes, or style objects;
* queued IPC or bridge payloads;
* Electron/main-process or child-process buffers;
* development-only profiling data.

## Questions the evidence must answer

* How many provider events and store publications occur per second?
* How many React commits does one provider event cause?
* Which components render for text-only, reasoning, tool, usage, status, and timer updates?
* Does work per delta grow with total transcript entries or only with the active entry?
* Is the dominant time JavaScript, Markdown parsing, render-group construction, React reconciliation, layout, paint, scrolling, or garbage collection?
* Does memory growth follow final transcript size, number of deltas, number of renders, or elapsed time?
* Which process and retaining owner account for the production growth?

## Fix selection

Choose fixes only after the profiles answer the questions above:

* If event frequency is the cause, coalesce renderer presentation updates while keeping canonical desktop state and persistence complete. Flush immediately for questions, approvals, errors, terminal states, and the final pending delta.
* If broad snapshots are the cause, expose stable primitive or focused-reference selectors at the smallest rendering boundary. Text-only deltas must not rerender usage, history, selectors, prompt controls, or popup chrome.
* If transcript rebuilding is the cause, preserve stable render-group references or update only the affected group. Completed historical rows and collapsed groups must not rerender when the active entry changes.
* If layout or scrolling is the cause, reduce layout reads and scroll writes without changing stick-to-end behavior.
* If retained memory belongs to another process or buffer, fix that owner instead of adding React memoization.

Do not add batching flags, compatibility modes, or alternate code paths unless verified call sites require different behavior.

## Acceptance criteria

* Before-and-after production Performance profiles use the same recorded workload and their findings are summarized with event counts, commit counts, main-thread time, layout/paint time, and peak/retained memory by process.
* The responsible production process and its dominant retaining path are identified; development `PerformanceMeasure` retention is reported separately.
* A text-only delta updates the active transcript content but does not rerender usage summary, conversation picker, agent selectors, prompt editor, completed historical messages, or collapsed completed-tool/sub-agent groups.
* Under a burst, visual transcript commits are bounded by the chosen presentation interval rather than matching every provider delta, if profiling shows event frequency is material.
* Retained memory after completion is proportional to the final canonical transcript, not the number of deltas or React commits. Closing the popup releases popup-owned render state and observers.
* Streaming content, ordering, replacements, questions, approvals, usage, errors, completion, scroll anchoring, and persisted conversation output remain unchanged.
* Add deterministic regression tests for the selected state/publication boundaries and affected UI behavior. Do not add timing-sensitive CI assertions or tests that launch agents, Electron, shells, or external programs.
* Run affected tests during implementation, then `npm run test:unit`, `npm run typecheck`, and `npm run lint` in `app/`. If desktop streaming behavior changes, also run the affected desktop tests and its full test suite.

## See also

* `design/releases/0_1_0/F_138_reduce_action_popup_rerenders_during_streaming.md`
* `design/feature_descriptions/J_28_finishing_action_very_slow.md`
* `design/architecture/initial description/action_popup.md`
* `design/architecture/initial description/writings/running_actions.md`
* `design/architecture/architectural_decisions.md`