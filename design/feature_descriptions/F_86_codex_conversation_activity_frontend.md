---
author:
id: F_86
internalId: d3327df5-7931-4bd0-bf65-3b7fe4eb1417
title: Codex conversation activity and rate-limit UI
status: new
owner:
affects:
policy:
  checkLinting: true
  requireTests: true
after: 7370ea37-ac9b-4445-a129-89e1ae5c7cb8
---

# Goal

Show Codex reasoning, commands, and other useful agent activity in the conversation chat, and show current Codex account limits in the application status bar.

# Current state

`ActionConversationChat` filters conversation data to user and assistant messages. It renders both as Markdown balloons; all `conversation.events` are hidden.

Live action state in `ActionExecutionService` holds user messages plus one assistant text buffer. It cannot carry item lifecycle updates. `StatusBar` contains project counts, sync, persisted token usage, remote status, keyboard state, and running agents. No service or component consumes Codex account limits.

# Implementation details

## Ordered chat activity

- Build one ordered chat feed from messages and structured activities using backend sequence. Never sort changing items by their latest timestamp.
- Extend live `agentTurn` state with activity entries. Upsert `agentActivity` updates by item id so streaming deltas grow one box instead of adding rows.
- Keep user and assistant Markdown balloons unchanged.
- Add one component per non-trivial activity type:
  - `ReasoningActivity`: distinct subdued box showing `Reasoning` plus running/completed/failed state. Render readable summary text; use raw reasoning text only when supplied and no summary is available. Preserve summary-section boundaries.
  - `CommandExecutionActivity`: one box for every command, created at `item/started`. Collapsed by default. Header shows command label, status, and a safely truncated one-line preview. Expanded content shows exact command, working directory, output, exit code, and duration in a scrollable monospace layout.
  - `AgentToolActivity`: collapsed generic box for file changes, web searches, MCP/dynamic/collaboration tools, image views, plans, compaction, and system notices. Use human labels and selected normalized fields; never dump raw JSON.
- Command expand/collapse must use an accessible button with `aria-expanded`, keyboard operation, and a stable label.
- Long commands/output wrap or scroll inside the box and never widen the popup. Preserve line breaks and whitespace.
- Show running state immediately; replace it with authoritative completed/failed/declined state without moving the entry.
- Failure details use error styling but remain inside the activity entry. Actual renderer/service failures still go through `dialogService`.
- Feed growth participates in existing sticky-at-end behavior. Streaming reasoning or command output follows the bottom only while the user remains at the bottom.
- Use the same renderer for live card/project conversations and loaded history.

## Codex rate-limit state and status bar

- Add a runtime `CodexRateLimitService` owning the current in-memory snapshot and bridge subscription. This is application state; `StatusBar` and other components do not own it.
- Do not use local storage, config, project data, conversations, activity files, or persisted React state.
- Add `CodexRateLimitStatus` as a separate leaf component in `StatusBar`. Subscribe inside this smallest component.
- Hide it until a valid Codex rate-limit snapshot exists. Do not show `0%` for unavailable/API-key state.
- Compact label shows `Codex` and highest used percentage. If multiple buckets exist, tooltip/popover lists each named bucket.
- For primary and secondary windows show percent used, window duration, and reset time in local time. Clearly label percentage as **used**, not remaining.
- Show reached-limit state with error color and accessible text. Use a named warning threshold for near-limit color; normal state stays consistent with other status items.
- Reset countdown/time updates locally from the received timestamp without writing state back to backend. Expired data becomes visually stale/hidden until refreshed; it must not reset itself to zero.
- Keep status bar height and spacing from `STYLE_GUIDE.md`; no popup may overflow narrow desktop windows.

## Explicit scope additions

Besides requested reasoning, commands, separators, and limits, include these already emitted high-value signals:

- file-change lifecycle and affected paths;
- web-search and MCP/dynamic/collaboration tool activity;
- plan/compaction notices;
- command output and final exit status;
- model reroute, safety buffering, verification requirement, and detailed turn failure.

Do not add approval UI, diff rendering, command cancellation, rate-limit reset-credit consumption, account login, or persistent usage history in this feature.

# Edge cases and failure modes

- Text-only reasoning or reasoning with no text.
- Multiple reasoning sections and multiple agent-message items in one turn.
- Commands with multiline scripts, quotes, Unicode, no output, huge output, failure, decline, or missing duration.
- Concurrent tools and identical timestamps: sequence remains deterministic.
- Historical conversation selected while another conversation streams: updates stay with their conversation.
- User scrolls up while activity grows: viewport does not jump.
- Several rate-limit buckets, unnamed buckets, missing secondary window, unknown reset time, percent at/over 100, clock skew, and stale updates.
- Remote-control disconnect: retain only current client-memory snapshot, mark stale/hide it, and resubscribe on reconnect.
- Non-Codex agents: no Codex-specific empty boxes or rate-limit placeholders.

# Testing implications

- Add user-centric chat tests for reasoning lifecycle/text, one collapsed command per start event, expand/collapse accessibility, exact command text, final status/output, generic activity labels, deterministic ordering, and provider filtering.
- Add regression tests for assistant Markdown balloons and the completion separator.
- Extend sticky-scroll tests with growing reasoning and command output.
- Add `CodexRateLimitService` tests for subscription, replacement, staleness, reconnect, and no persistence.
- Add status component tests for hidden/unavailable state, one and multiple buckets, used-vs-remaining wording, reset formatting, warning/reached styling, and keyboard access.
- Update `StatusBar` tests without weakening existing count, sync, remote, keyboard, or running-agent assertions.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in `app/`.

# Acceptance criteria

- Reasoning appears as a distinct live box with available text and correct lifecycle state.
- Every Codex command appears immediately in its own collapsed box; expanding shows its full command and available execution details.
- Commands, reasoning, tool activity, and messages keep provider order during streaming and after reload.
- Chat remains sticky only when already at the end.
- Status bar shows current account-wide Codex usage for all reported buckets and reset windows.
- Rate-limit data is absent after app restart until Codex reports or reads a new runtime value.
- Rate-limit data never appears in project, card, action, conversation, config, or browser persistence.
- Claude and generic agent conversations retain current behavior.

# See also

- [F_85 Codex app-server activity backend](F_85_codex_app_server_activity_backend.md)
- [F_004 app layout](../releases/0_0_2/F_004_app_layout.md)
- [F_052 agent popup conversation layout](../releases/0_0_2/F_052_agent_popup_conversation_layout_and_expansion.md)
- [F_83 chatlog sticky at end](F_83_chatlog_sticky_at_end.md)
