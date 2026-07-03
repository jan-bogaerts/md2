---
id: F-011
title: batch commands
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Support batch/PowerShell/bash scripts (with parameters and placeholders) in configurable folders as runnable actions; the Electron app monitors these folders and adds/updates/removes the related actions, notifying the React app of changes.

## see also
- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\data management.md`
