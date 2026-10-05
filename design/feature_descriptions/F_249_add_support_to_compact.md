---
internalId: 25184e4d-b340-439f-bf0a-dd54afd466b2
id: F_249
status: ready
title: add support to compact
after: 64933355-a3df-4476-b05f-c82b0c81b02a
agents:
  - design/activity/card__25184e4d-b340-439f-bf0a-dd54afd466b2.json
changedFiles:
  - app/compact_review.html
  - app/compact_review.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.grouped.test.tsx
  - app/src/components/actions/run/popup/action_popup_bottom_row.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.grouped.test.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.test.tsx
  - app/src/components/actions/run/popup/action_prompt_menu.tsx
  - app/src/data/action_run_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_compact_service.node.test.ts
  - app/src/services/actions/action_compact_service.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/data/remote_control_storage_service.node.test.ts
  - app/src/services/data/remote_control_storage_service.ts
  - app/vitest.compact_review.config.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_agent_executor.test.mjs
  - desktop/src/actions/action/action_compact_queue.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/agent/agent_claude_streaming_adapter.js
  - desktop/src/actions/agent/agent_compact.test.mjs
  - desktop/src/actions/agent/agent_run_interactions.js
  - desktop/src/actions/agent/agent_run_state.js
  - desktop/src/actions/agent/agent_runner_service.js
  - desktop/src/actions/agent/agent_streaming_adapter.js
  - desktop/src/actions/agent/agent_streaming_event_handlers.js
  - desktop/src/shell/local_bridge_dispatch.js
  - desktop/src/shell/local_bridge_dispatch.test.mjs
  - desktop/src/shell/preload.js
  - desktop/src/shell/preload.test.mjs
branch: f_249_add_support_to_compact
worktree: 3
---
chat needs to be compacted sometimes. we need a button for this.

Currently there is a clip icon at the bottom of the action popup´s input box. This needs to become a hamburger icon that opens a context menu which containd:

* Compact: sends command to the agent to compact conversation
* Add file: the current clip icon

Use icons and compact context menu

## Current state

* `ActionPopupBottomRow` shows `MarkdownAttachmentControl` before agent selectors for agent actions on desktop; mobile hides it. The footer currently spaces controls with `gap: 1` and `justifyContent: 'space-between'`.
* Attachments use `attachFilesToCardMarkdown` when a card file is available, otherwise `attachFilesToOriginalMarkdown`. Both insert Markdown into the service-owned prompt draft. The picker supports multiple files and resets after selection.
* `runPopupAction` submits draft text through the action runner. Its prompt queue can dispatch during an active turn; Codex then uses `turn/steer`. This queue therefore cannot safely accept compact as ordinary prompt text.
* Codex uses an app-server streaming adapter and already renders `contextCompaction` events as `Context compacted`. Claude sends streaming user messages, but its adapter currently ignores non-init system events, including compaction boundaries. Neither agent has an explicit compact operation through the application bridge.
* Saved conversations retain provider session references for continuation. Conversation identity is `AgentConversation.id`; `conversation.path` locates persisted data. Card identity remains `cardInternalId`.

## implementation details

* Compact means asking the provider to summarize older model context so the same conversation can continue with less context. Keep the application's visible and persisted transcript; compact does not delete messages or start a new conversation.
* Replace the footer paperclip with a hamburger button on desktop and mobile. Add `action_prompt_menu.tsx` beside the footer; it owns menu interaction and file picking. Show icon-labelled entries in order: **Compact**, **Add file**. Use theme-default dense MUI menus, outlined icons, tooltip, accessible names, keyboard navigation, and Escape dismissal. Follow `design/STYLE_GUIDE.md` and `design/architecture/architectural_decisions.md`.
* Group hamburger and agent selector together. On mobile, use zero gap and no distributing space between these two controls; retain spacing before trailing run controls. Keep command-action footers unchanged. Add file preserves current multi-file selection, preparation guard, copy/original choice, draft insertion, cancellation, and error reporting. Leave shared `MarkdownAttachmentControl` and attachment helpers unchanged for their other callers.
* Add a dedicated compact request to `ElectronActionBridge`, desktop preload method list, `local_bridge_dispatch`, and `RemoteControlStorageService` so mobile remote control reaches the same backend. Capture request ID, displayed conversation ID, persistence reference, and provider when clicked. Validate loaded conversation identity and ownership before executing; changing popup selection afterward must not retarget the request. Use the conversation's provider session, not an unapplied selector change.
* Services own compact requests and their queued/running/completed/failed state. Expose conversation-scoped `EventTarget` events and actual state snapshots through `useSyncExternalStore`. Compact stays selectable while the agent runs, starts, waits for input, or already has compact work pending. Each accepted request executes once. With no conversation/history, report that there is nothing to compact; unavailable backend or missing provider session produces a clear error through `dialogService`.
* Add compact scheduling to `ActionRunnerService`/`ActionRun` and `AgentRunnerService`. A safe dispatch point means initialized provider session, no active turn or compaction, and no unanswered question or approval. Dispatch immediately at that point; otherwise queue against captured conversation. A `waitingForInput` status alone is insufficient because questions and approvals also use it. Preserve request order and serialize provider writes. Hold later prompts until preceding compact completes, without changing existing mid-turn prompt behavior when no compact is pending. Resume queued work after initialization, turn completion, or interaction resolution; use bounded processing, not recursive drains.
* For a saved conversation without a live process, resume its existing provider session in a compact-only workflow. Extend startup to allow compaction without sending the action prompt, draft, synthesized `continue`, or card-reference suffix. Do not run action before/after chains merely to compact. Keep conversation identity and persistence ownership. Closing the popup leaves accepted work running; Stop, Finish, project shutdown, or target deletion cancels outstanding requests rather than silently resuming them later.
* Codex adapter sends `thread/compact/start` with `threadId`; acknowledgement means accepted, not completed. Use existing turn/item notifications and `contextCompaction` lifecycle to track completion. Claude adapter sends exactly `/compact` as a provider command and handles `system`/`compact_boundary`; wait for the result before releasing subsequent work. A successful Claude result without a boundary can mean insufficient history: show the provider's explanation, not false completion. See [Codex app-server](https://learn.chatgpt.com/docs/app-server) and [Claude compact command](https://code.claude.com/docs/en/agent-sdk/slash-commands#compact-history-with-compact).
* Persist confirmed compaction events through existing checkpoint handling and apply provider-reported context usage before notifying subscribers. Preserve accumulated usage and transcript entries; do not invent a token reduction. Report provider rejection, missing session, disconnect, and persistence failure explicitly. Clear pending state on failure; do not retry automatically when provider acceptance is uncertain.
* Add menu/footer tests, service queue tests, provider adapter tests, and local/remote bridge tests with mocked boundaries. Cover draft preservation, target changes, active turns, pending interactions, repeated requests, saved-session startup, insufficient history, provider failure, and cancellation. Run affected test files independently and `npm run lint` in affected subprojects during implementation. Manually verify mobile adjacency, narrow layouts, keyboard use, and light/dark themes.

## acceptance criteria

1. Desktop and mobile agent footers show a hamburger menu containing Compact and Add file, each with an icon. Mobile has no layout gap between hamburger and agent selector. Command footers and other attachment controls retain existing behavior.
2. Add file opens the existing multi-file workflow and inserts the same Markdown. Closing the picker changes nothing. Compact never submits, replaces, or clears draft text or attachments.
3. Compact works for Codex and Claude in the displayed conversation. It remains selectable during active turns and pending interactions; accepted requests wait until safe and execute once in order. Later prompts cannot overtake pending compact work.
4. Selecting another conversation or closing the popup after clicking Compact does not change the captured target. Saved conversations resume their existing provider session solely to compact; no action prompt or action chain runs.
5. Queued, running, completed, and failed requests are distinguishable. Completion follows provider confirmation, never queue acceptance or socket write alone. Too-short history reports an explanation without claiming compaction occurred.
6. After successful compaction, further messages continue the same conversation with compacted provider context. Visible transcript remains intact, confirmed events survive reload, and context usage reflects provider reports.
7. Missing history, unavailable backend/session, provider errors, disconnects, and failed persistence produce clear feedback. Stop, Finish, shutdown, and target deletion cancel outstanding work. No request affects another conversation or automatically retries uncertain acceptance.
