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
Store agent outputs in JSON files referenced from Markdown files, show conversations on cards and in the editor, distinguish live stdin from post-completion continuation, and provide a single-click `Continue` that starts or resumes a linked Electron agent run.

## Current state
Not implemented. Cards are parsed from markdown headers and rendered in `ProjectWorkspace`, but `ProjectCard` has no agent-output references and the shared parsing service does not yet read or write agent metadata. The editor is a single multiline `TextField` with no toolbar, bottom split panel or conversation viewer.

The app shell has a running-agents status indicator, but `App` always passes an empty list. Electron exposes only local Git/project capabilities through `window.md2Data`; there is no agent process bridge, log storage, stdout/stderr streaming, stdin forwarding or persisted conversation model yet.

## implementation details
- Add an agent-output reference field to card metadata stored in markdown, using json log files as the conversation source of truth.
- Define a typed agent conversation model for persisted logs: identity, related card path, status, timestamps and ordered messages/events.
- Extend data loading so markdown cards resolve their referenced agent json files without treating missing or invalid required log data as empty conversations.
- Show an action/agent led on cards that opens a list of conversations for that card, including running, completed and failed states.
- Add an editor toolbar button that opens a horizontal split; the bottom panel shows the selected conversation for the active card.
- While an agent process is running, forward submitted conversation input to that active process through Electron stdin.
- After a process finishes, submitted input starts or resumes a linked Electron run; it is not sent to the completed process.
- Provide a single-click `Continue` action everywhere a finished conversation is shown; it uses `continue` as the continuation input and links the resulting log to the same card.
- Keep action orchestration and process execution in Electron/F-013; React calls explicit start, input, continue, and cancel methods and owns only display state and user actions.
- Surface missing log files, malformed json, bridge failures and failed agent starts as user-visible errors.

## acceptance criteria
- Markdown cards can reference one or more agent json outputs, and those references survive editing/saving.
- Agent json logs load into typed conversations linked to the correct card.
- A card with agent conversations shows an led/action indicator; activating it lists the card's conversations and their states.
- The editor toolbar can show/hide a bottom split conversation panel for the active card.
- Input on a running conversation reaches its active stdin; input on a finished conversation creates or resumes a linked run.
- Every finished conversation has a one-click continue control that supplies `continue` and links the new output to the card.
- Running-agent state updates the shell indicator and the related card/conversation UI.
- Missing/malformed logs and agent bridge failures are reported clearly without breaking card loading.
- Tests cover metadata parsing, log loading errors, card conversation list, editor split panel and continue action behavior.

## see also
- `design\architecture\initial description\agents.md`
- `design\architecture\initial description\desktop app.md`
- `design\architecture\parsing_service.md`
- `design\architecture\initial description\overview.md`
