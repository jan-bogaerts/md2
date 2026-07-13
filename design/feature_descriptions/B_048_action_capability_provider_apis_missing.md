---
id: B-048
title: action editor has no configured default agent capabilities
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

`AgentCapabilitiesService` reads `desktop.agentProfiles[].models`, but the built-in Codex and Claude profiles have empty model lists. Model loading therefore reports `Model capability API is not configured`. Thinking-level loading always reports `Thinking-level capability API is not configured`.

Result: supported built-in agents cannot satisfy the action-editor contract. Model and thinking-level controls become error-disabled instead of showing configured capabilities.

## Current code

- `app/src/services/agent_capabilities_service.ts`
- `app/src/components/actions/action_agent_capability_fields.tsx`
- `shared/agent_profiles.mjs`

## Fix

- Make each configured agent profile the authoritative source for its model list.
- Provide non-empty default model lists in the built-in Codex and Claude profiles. Users can override them through profile configuration.
- Use fixed thinking-level choices: `none`, `low`, `medium`, `high`, and `max`. `none` means no thinking-level override.
- Do not call OpenAI or Claude provider APIs and do not require provider API credentials.
- Keep request state, stale-response rejection, caching, loading, and errors in `AgentCapabilitiesService`.
- Check supported executable availability during app bootstrap and expose unavailable agents as disabled with an explanation.
- Reject missing, empty, duplicate, or malformed profile model lists with a clear capability error.
- Preserve a stored model/thinking level in the control while capabilities load so opening an existing action does not erase its draft.

## Edge cases

- Agent changes while an older model request is in flight.
- Model changes while an older thinking-level request is in flight.
- A configured profile contains an empty list, duplicate values, or malformed values.
- Electron is unavailable in web mode; editor remains usable and shows a local capability error without corrupting the definition.
- Existing action names a model removed from its configured profile.

## acceptance criteria

- Selecting supported Codex and Claude agents loads models from their configured profiles, including built-in defaults.
- Selecting a loaded model exposes the fixed thinking-level choices.
- Profile and executable-availability errors appear beside the affected control.
- Stale responses cannot replace capabilities for the current selection.
- No provider credential is required or read.
- Tests cover built-in defaults, profile overrides, invalid lists, unavailable executables, stale responses, and switching selections.

## see also

- `design\architecture\initial description\writings\action_editor.md`
- `design\architecture\initial description\writings\running_actions.md`
- [[F-033]]
