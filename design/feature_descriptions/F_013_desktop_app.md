---
id: F-013
title: desktop app
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Build the Electron app that hosts the React app and bridges it to the file system and local Git (via preload.js and a WebSocket server for "remote control"), and that runs the agents, capturing stdin/stdout/stderr into logs linked to cards.

## see also
- `design\architecture\initial description\desktop app.md`
- `design\architecture\initial description\data management.md`
- `design\architecture\initial description\overview.md`
