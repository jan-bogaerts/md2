---
id: B-035
title: agent profiles are edited as a raw JSON textarea
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
F-033 requires that "a user can define a new agent profile with a custom command line through the config UI". The current `/config` surface technically allows it, but `desktop.agentProfiles` renders as a raw JSON textarea (`entry.type === 'json'` branch in `app/src/components/config/config_value_editor.tsx`): the user must hand-write `[{ "name": …, "command": …, "modelArgument": …, "models": [...], "resumeCommand": …, "sessionIdPattern": … }]` without any guidance. Validation (`validateDesktopAgentProfiles`) only runs on save, so a typo in a field name is silently dropped or rejected wholesale, and `JSON.parse` errors surface as save failures. The profile schema (six optional/required fields, `{{model}}`/`{{sessionId}}` placeholders, regex with one capture group) is exactly the kind of structure a form should carry.

## Fix
- Replace the JSON textarea for `desktop.agentProfiles` with a structured list editor: rows of existing profiles (built-ins shown read-only) with add/edit/remove for user profiles.
- Per-profile form fields: name, command (with `{{model}}` placeholder hint), model argument, models (chip/list input), default model, resume command (`{{sessionId}}` hint), session-id pattern; validate on field level (duplicate name, empty command, invalid regex, pattern missing a capture group) before enabling save.
- Keep the underlying config value shape and `validateAgentProfiles` as the final gate so the desktop store, action loader and popup pickers are untouched.
- Keep an "edit as JSON" escape hatch only if it costs nothing; the form is the primary path.

## acceptance criteria
- A user can add a new agent profile from `/config` by filling in fields, without typing JSON.
- Built-in profiles are visible but not editable/deletable; user profiles can be edited and removed.
- Field-level validation reports duplicate names, empty commands and invalid session-id patterns before save.
- Saved profiles appear in the app-menu default-agent picker and the action popup agent picker, as today.
- Tests cover add/edit/remove flows, validation errors and persistence round-trip through the desktop config bridge.

## see also
- `design\feature_descriptions\ready\F_033_agent_and_model_selection.md`
- `design\feature_descriptions\ready\F_016_config.md`
