---
id: F-9
title: actions popup
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: 50de9d63-791e-4f7d-ae4a-10cc69c5fb6e
---

## Goal
the actions popup needs to consist out of:
- a horizontal (scrollable) list of toggle buttons (mutually exclusive). 
  - each button is an action out of the 'actions' list
  - the last button is a custom action 'custom prompt'
  - a + sign to add a new action
    - when clicked, another input field is shown 'name', 2 extra buttons 'save' and 'save and run'

## see also
- `design\architecture\initial description\animations.md`
