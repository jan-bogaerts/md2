---
id: F-012
title: agents
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Store agent outputs in json files referenced from md files, show agent conversations on cards (led + conversation list) and in the editor (toolbar button + bottom split panel), with a single-click "continue" that starts a new agent.

## Current state
Not implemented. Cards are parsed from markdown headers and rendered in `ProjectWorkspace`, but `ProjectCard` has no agent-output references and the shared parsing service does not yet read or write agent metadata. The editor is a single multiline `TextField` with no toolbar, bottom split panel or conversation viewer.

The app shell has a running-agents status indicator, but `App` always passes an empty list. Electron exposes only local Git/project capabilities through `window.md2Data`; there is no agent process bridge, log storage, stdout/stderr streaming, stdin forwarding or persisted conversation model yet.

## implementation details
- Add an agent-output reference field to card metadata stored in markdown, using json log files as the conversation source of truth.
- Define a typed agent conversation model for persisted logs: identity, related card path, status, timestamps and ordered messages/events.
- Extend data loading so markdown cards resolve their referenced agent json files without treating missing or invalid required log data as empty conversations.
- Show an action/agent led on cards that opens a list of conversations for that card, including running, completed and failed states.
- Add an editor toolbar button that opens a horizontal split; the bottom panel shows the selected conversation for the active card.
- Provide a single-click continue action everywhere a conversation is shown; it starts a new agent run with `continue` as stdin/input and links the new log to the same card.
- Keep actual process execution in Electron/F-013; React calls explicit bridge/service methods and owns only display state and user actions.
- Surface missing log files, malformed json, bridge failures and failed agent starts as user-visible errors.

## acceptance criteria
- Markdown cards can reference one or more agent json outputs, and those references survive editing/saving.
- Agent json logs load into typed conversations linked to the correct card.
- A card with agent conversations shows an led/action indicator; activating it lists the card's conversations and their states.
- The editor toolbar can show/hide a bottom split conversation panel for the active card.
- Every visible conversation has a one-click continue control that starts a new agent run with `continue` and links the new output to the card.
- Running-agent state updates the shell indicator and the related card/conversation UI.
- Missing/malformed logs and agent bridge failures are reported clearly without breaking card loading.
- Tests cover metadata parsing, log loading errors, card conversation list, editor split panel and continue action behavior.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\architecture\parsing_service.md`
- `design\architecture\initial description\overview.md`
