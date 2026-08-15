---
author: 
id: F_192
internalId: ee2036c1-4931-49a4-b57e-629edbcbc3f6
title: context usage display
status: ready
owner: 
affects:
agents:
  - design/activity/card__ee2036c1-4931-49a4-b57e-629edbcbc3f6.json#conversation=agent-4c6a99ef-9001-4989-8dd8-4e66b685e000
  - design/activity/card__ee2036c1-4931-49a4-b57e-629edbcbc3f6.json#conversation=agent-2ebef5dd-f89e-4846-880a-1685b7d90847
policy:
branch: f_192_context_usage_display
worktree: 1
---

context usage on the chatlog of the action popup needs improving:

* drop text, should be put in a tooltip
* use a circular progress to indicate value

# Current state

`ActionConversationChat` renders context-window usage as visible `context: N%` caption text at right of conversation metadata row. `contextWindowUsedPercent` derives `N` from displayed conversation's latest `usedTokens / capacityTokens`, rounds to whole number, caps it at `100`, and returns no value for missing or invalid data. `ActionConversationChatOwner` selects live conversation while action runs and selected persisted conversation otherwise, so value already updates during runs and when user changes conversation.

Here, **context-window usage** means share of displayed conversation's effective token capacity currently occupied. **Determinate circular progress** means ring whose filled arc represents known percentage from `0` through `100`; it is not loading spinner.

# Implementation details

- In `app/src/components/actions/conversation/action_conversation_chat.tsx`, replace visible `context: N%` `Typography` with compact MUI `CircularProgress` using `variant="determinate"` and validated percentage as `value`.
- Wrap ring in MUI `Tooltip` with `Context usage: N%`. Remove visible context text; keep exact percentage available on hover and touch interaction.
- Give progress ring accessible context-usage name and numeric value so assistive technology does not depend on tooltip. Keep theme-derived informational color and align ring at right of existing metadata row without changing row height materially.
- Keep `contextWindowUsedPercent` calculation unchanged: whole-number rounding, `100%` cap, and hiding missing, zero-capacity, negative, or malformed snapshots.
- Keep live updates, persisted-conversation selection, duration, status, transcript scrolling, and sticky-to-end behavior unchanged. No desktop, persistence, data type, or conversation-schema change needed.
- Update `ActionConversationChat` and owner tests to assert determinate value, accessible name, tooltip text, live usage updates, conversation switching, capped value, and hidden indicator for unavailable data. Keep helper unit tests.

# Acceptance criteria

- Displayed conversation with `usedTokens = 42,000` and `capacityTokens = 258,400` shows ring filled to `16`; visible `context: 16%` text is absent.
- Hovering or touching ring shows `Context usage: 16%` tooltip. Assistive technology exposes ring as context usage with numeric value `16`.
- Usage above capacity displays full `100` ring and `Context usage: 100%` tooltip.
- Missing or invalid context usage renders no ring and no tooltip; duration remains visible.
- Live usage notifications update ring and tooltip during active run. Switching displayed conversations updates both from newly displayed conversation.
- Duration, status, metadata alignment, transcript scrolling, sticky-to-end behavior, and conversation persistence remain unchanged.
