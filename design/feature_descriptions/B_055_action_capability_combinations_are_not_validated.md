---
id: B-055
title: invalid action model and thinking-level combinations can be saved
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`validateAgentSelection` skips model membership validation when a profile has an empty model list. `thinkingLevel` is only checked for the presence of agent/model; its value is not checked against the fixed thinking-level list. Invalid values can therefore be saved and reach execution.

## Fix

- Keep structural validation pure and shared: model requires agent; thinking level requires agent and model.
- Validate models against the authoritative configured profile list from [[B-048]]. Empty model lists are invalid rather than allow-all.
- Validate thinking levels against `none`, `low`, `medium`, `high`, and `max`.
- Validate again in Electron immediately before execution because configuration may change after save.
- If a previously saved model is removed from its profile or a thinking level is invalid, keep it visible, mark it unavailable, and block a new save/run until changed or cleared.
- Return structured `agent`, `model`, or `thinkingLevel` errors through [[B-053]].

## Edge cases

- Empty or malformed configured model list.
- Agent changes while old model/thinking values remain in draft.
- Profile configuration removes a model after a definition was saved.
- Web editing uses the same configured profile and fixed thinking-level validation.
- Run-specific override differs from definition value.

## acceptance criteria

- Known unsupported models and thinking levels cannot be saved or executed.
- Empty or malformed profile lists are reported and never treated as allow-all.
- Retired values remain visible and actionable.
- Save-time and execution-time validation use the same capability semantics.
- Tests cover built-in defaults, empty/malformed profile lists, removed values, selection changes, runtime overrides, and Electron revalidation.

## see also

- [[B-048]]
- [[B-049]]
- [[B-053]]
- `design\architecture\initial description\writings\action_editor.md`
