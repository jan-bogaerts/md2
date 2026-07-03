---
id: F-010
title: actions
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Load action definitions (json) from the project's actions folder and run them via the Electron app: agent or cmd type, placeholders, before/after sub-actions, condition→action pairs on output, circular-call checking, state-change triggers (`onState`), and context-sensitive UI display via `appliesTo`.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\overview.md`
- `design\architecture\initial description\data management.md`
