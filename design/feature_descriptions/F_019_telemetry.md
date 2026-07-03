---
id: F-019
title: telemetry
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Add Sentry error reporting and Aptabase usage logging in both the React and Electron apps, tracking key events (create/open project, create card, start, navigation, stop) without details, with keys kept out of the repository.

## see also
- `design\architecture\initial description\telemetry.md`
