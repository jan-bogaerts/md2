---
author: 
id: F_96
internalId: d33002d3-ee0e-4c08-8e26-36f790500ee2
title: ctrl enter on action input
status: ready
owner: 
affects:
agents:
policy:
after: 
worktree: 2
---

when pressing ctrl + enter on action input, the input is sent, this is good, but before this happens, the input box still adds an enter, which should not be the case.

# Current state

`ActionAgentPrompt` handles `Ctrl+Enter` and `Meta+Enter` on the prompt wrapper during event bubbling. MDXEditor handles `Enter` first, inserts a newline, then the wrapper flushes and sends the changed prompt.

# Implementation details

- Intercept `Ctrl+Enter` and `Meta+Enter` during capture, before MDXEditor handles the key.
- Prevent default behavior and stop propagation, then flush the latest prompt before running the existing shortcut callback.
- Keep plain `Enter`, `Shift+Enter`, and disabled shortcut behavior unchanged.
- Extend `action_agent_prompt.test.tsx` with regression coverage proving the editor does not receive the send shortcut.

# Acceptance criteria

- `Ctrl+Enter` sends current prompt without inserting a newline.
- `Meta+Enter` has same behavior.
- Prompt is flushed before send callback runs.
- Plain `Enter` and `Shift+Enter` still insert newlines.
