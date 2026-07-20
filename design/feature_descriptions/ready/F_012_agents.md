---
id: F-012
title: agents
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Store full agent conversations in stable card/project activity files, show them on cards and in the editor, and start every initial or follow-up turn as a one-shot Electron process.

## Current state
Implemented. Stable activity files own persisted conversations; cards reference conversations by compound activity reference. Editor agent panel shows loaded conversations and live action state; follow-ups open shared action form with agent/model/thinking selection. Electron owns one-shot process execution, structured streaming, cancellation, provider sessions, and terminal transcript persistence.

## implementation details
- Add an agent-output reference field to card metadata stored in markdown, using compound activity-file/conversation ids as references.
- Define a typed agent conversation model embedded in the stable card/project activity file: identity, status, timestamps and ordered messages/events.
- Extend data loading so markdown cards resolve compound conversation references without treating missing or invalid activity data as empty conversations.
- Show an action/agent led on cards that opens a list of conversations for that card, including running, completed and failed states.
- Add an editor toolbar button that opens a horizontal split; the bottom panel shows the selected conversation for the active card.
- Disable submitted conversation input while a turn is running.
- After a turn finishes, submitted input starts another process and atomically replaces the terminal conversation in the same activity file.
- Let follow-ups select any configured agent. Resume its explicit provider id when synchronized; otherwise send normalized persisted history through stdin.
- Keep action orchestration and process execution in Electron/F-013; React calls explicit start, input, continue, and cancel methods and owns only display state and user actions.
- Surface missing activity files/conversations, malformed json, bridge failures and failed agent starts as user-visible errors.

## acceptance criteria
- Markdown cards can reference one or more activity conversations, and those references survive editing/saving.
- Activity conversations load into typed conversations linked to the correct card.
- A card with agent conversations shows an led/action indicator; activating it lists the card's conversations and their states.
- The editor toolbar can show/hide a bottom split conversation panel for the active card.
- Input is disabled while a turn runs; input on a finished conversation starts a new one-shot turn.
- Every successful provider turn records its explicit provider id and transcript cursor in the owning activity conversation.
- Running-agent state updates the shell indicator and the related card/conversation UI.
- Missing/malformed activity and agent bridge failures are reported clearly without breaking card loading.
- Tests cover metadata parsing, log loading errors, card conversation list, editor split panel and continue action behavior.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\architecture\parsing_service.md`
- `design\architecture\initial description\overview.md`
