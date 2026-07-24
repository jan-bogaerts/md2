---
internalId: 19fdda48-ceaf-4176-8ad3-fb78ff6e34c6
---

# Actions

- The action list is loaded when a project is loaded from the `actions` folder.
- Action definitions can be edited in web or Electron mode, but actions can only run through Electron.
- Each action is a JSON object containing:
  - `id`: required stable generated identifier. All action links and execution requests use this value.
  - `name`: required editable action name. It is not used as an identifier.
  - `label`: required user-facing label.
  - `description`: required description.
  - `type`: `agent` or `command`.
  - `prompt`: required for an agent action.
  - `command`: required for a command action.
  - `onBefore`: optional ordered list of action `id` values.
  - `on`: optional ordered list of regular-expression conditions paired with an action `id`.
    - Conditions are evaluated against the action output.
    - For agent actions, the output is the latest response.
  - `onAfter`: optional ordered list of action `id` values.
  - `onState`: optional card state that triggers the action.
  - `needsWorkTree`: optional boolean that requires card context with a valid assignment from Git's linked-worktree list.
  - `icon`: optional path or SVG used for action entry points.
  - `appliesTo`: optional structured filters that determine when the action is available.
  - optional agent, model, and thinking-level overrides.
- `prompt` and `command` can contain placeholders:
  - `rootProjectFolder`;
  - `card-file`, containing the path to the selected Markdown card file;
  - `card-prompt`, containing the additional prompt entered when the card action runs.
- Action links always reference separately defined actions by `id`; linked actions are not defined inline.
- Action loading rejects unknown ids, duplicate ids, invalid regular expressions, and circular calls through `onBefore`, `on`, or `onAfter`.
- The Electron-side action runner loads the definition by `id`, resolves placeholders, executes the full chain, and publishes execution events. React displays definitions and execution state but does not run or orchestrate actions.

Example:

```json
{
  "id": "2ab66437-27a7-4e80-a98f-aea444e5ca36",
  "name": "implement",
  "label": "Implement",
  "description": "Implement this feature",
  "type": "agent",
  "prompt": "use '/implement-feature' to implement {{card-file}}",
  "needsWorkTree": true,
  "onBefore": [
    "8a5e9df1-56b0-4fd0-9c4c-f3c811272ae3"
  ],
  "onAfter": [
    "d230f1d6-c7a8-49cd-a567-e06463bd8fd7",
    "856a62e7-2779-4359-aee4-465363a8042f"
  ]
}
```

- A card state change can trigger an action through `onState`.
  - Example: dragging a card to `implementing` triggers the action whose `onState` is `implementing`.

---

# UI display

- Actions are displayed as closely as possible to the items they relate to.
- When every `appliesTo` filter matches, show the action.
- Supported filters include:
  - card;
  - history card;
  - architecture file;
  - folder;
  - history folder.
- On cards, actions can appear as small icon buttons, context-menu entries, or menu items.
- On folders, actions appear in the context menu.
- On files, actions appear in a local menu or toolbar.
- Activating an entry point opens the action popup for the action `id` and selected context.

---

# Batch commands

- Configurable folders in Electron and in the project contain batch, PowerShell, or Bash scripts exposed as command actions.
- Scripts can define parameters whose configured values and context placeholders are resolved at run time.
- Script actions use the same stable `id`, entry points, Electron-side runner, chaining, status, and errors as JSON-defined actions.
- Electron monitors configured script folders and notifies React when generated actions are added, removed, or changed.
- An agent can create a script and its related JSON action metadata in a configured folder.
