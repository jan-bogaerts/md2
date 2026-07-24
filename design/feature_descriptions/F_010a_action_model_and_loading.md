---
id: F-010a
title: action model and loading
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
internalId: fcb9323f-abb7-4e9a-bf58-9109c63a5ed3
---

## Goal

Define the canonical ID-based action model and load project action JSON into the action service exposed to React, failing fast on invalid definitions and circular calls. This slice provides loading and display data; execution belongs to the Electron runner in [[F-010c]].

## Current state

The shared loader currently uses action names as identity, accepts `agent | cmd`, stores executable content in `text`, supports inline/by-name `before`/`after`/`on` references, and includes `runIn`. Both React and Electron consume that resolved shape.

## implementation details

- Replace the legacy model with required `id`, `name`, `label`, `description`, and `type` (`agent` | `command`).
- Require `prompt` for agent actions and `command` for command actions.
- Support optional `icon`, `appliesTo`, `onBefore`, `on`, `onAfter`, `onState`, `needsWorkTree`, `agent`, `model`, and `thinkingLevel`.
- `id` is stable identity. `name` and `label` can change without changing links or execution requests.
- `onBefore` and `onAfter` are ordered action-id lists. `on` is an ordered list of `{ condition, actionId }` entries.
- Do not accept inline action definitions or action-name references. Do not add compatibility normalization for the old shape.
- Give the built-in custom-prompt action a stable reserved id and keep it independent of project files.
- Validate invalid JSON, missing or type-incompatible fields, duplicate ids, duplicate names, unknown action ids, self-references, invalid regular expressions, invalid action types, and circular calls through every link field.
- Load definitions from the configured actions folder on project open. Keep the previous valid set when a hot reload fails.
- Use one shared validator for React and Electron so the editor and Electron runner accept the same definitions.

## acceptance criteria

- Opening a project loads valid ID-based definitions and exposes them through the action service/hook.
- Renaming an action leaves every `onBefore`, `on`, and `onAfter` link valid.
- The built-in custom-prompt action is present with a stable reserved id.
- Legacy `cmd`, `text`, `before`, `after`, `runIn`, inline links, and name links fail validation clearly.
- Every listed validation failure names the source definition and prevents partial replacement of the valid action set.
- Shared fixture tests cover parsing, ID resolution, field validation, regular expressions, and cycle detection in both React and Electron.

## see also

- `design\architecture\initial description\actions.md`
- `design\architecture\initial description\writings\action_editor.md`
- `design\feature_descriptions\ready\F_010_actions.md`
