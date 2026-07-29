---
author: 
id: F_81
internalId: 23b4fb40-df7b-4ed7-916d-a4e1da0416ac
title: clear action-input after send
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__23b4fb40-df7b-4ed7-916d-a4e1da0416ac.json#conversation=agent-11a10699-cc62-4fe9-926b-ced3b0e00080
  - design/activity/card__23b4fb40-df7b-4ed7-916d-a4e1da0416ac.json#conversation=agent-bcd01ad3-dac7-4b66-a669-8231beeb00ba
policy:
after: 
---

# Goal

after sending a prompt to an agent, clear the input box.

# Current state

`useActionPopupController` clears follow-up input after a successful send, but an initial agent prompt remains visible until the full run finishes. `ActionAgentPrompt` resets only when the controller changes `promptResetToken`.

# Implementation details

- Clear controller prompt state, shared prompt draft, and editor when Electron accepts an initial agent run.
- Keep existing clear-after-success behavior for follow-up sends and phrase double-click sends.
- Preserve entered text when starting or sending fails.
- Do not change command-action input behavior.

# Acceptance criteria

- Initial agent prompt clears as soon as execution starts, without waiting for completion.
- Successful follow-up sends clear input.
- Failed starts and sends keep input available for retry.
- Send button and keyboard shortcut behave identically.
- Controller tests cover successful and failed initial and follow-up sends.
