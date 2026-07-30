# Action definition

One JSON file per action, stored in the project's actions folder. Edit them through the action editor (tree → action, or **New action** in the menu) — md² never shows raw JSON, but this is what ends up on disk.

{% raw %}
```json
{
  "id": "implement",
  "label": "Implement",
  "description": "Implement this feature",
  "type": "agent",
  "prompt": "Read and implement the feature described in {{card-file}}",
  "needsWorkTree": true,
  "appliesTo": { "kind": "card", "type": "feature" },
  "onBefore": ["prep-to-implement"],
  "onAfter": ["complete-card"]
}
```
{% endraw %}

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable identifier. Links and run requests use it, so renaming the label never breaks a chain. Must be unique, also after normalization (`My Action` and `my_action` collide). |
| `label` | yes | Text shown on buttons and menu entries. |
| `description` | yes | Shown in the action popup. |
| `type` | yes | `agent` or `command`. |
| `prompt` | agent only | Markdown prompt. Not allowed on command actions. |
| `command` | command only | Command line. Not allowed on agent actions. |
| `icon` | no | Icon shown by entry points. |
| `appliesTo` | no | Filters deciding where the action appears. See below. |
| `onBefore` | no | Ordered list of action ids to run first. |
| `on` | no | Ordered list of `{ "condition": "<regex>", "actionId": "<id>" }` rules matched against this action's output. |
| `onAfter` | no | Ordered list of action ids to run afterwards. |
| `onState` | no | Card state that triggers this action when a card enters it. |
| `needsWorkTree` | no | When true, the action requires a card with a valid worktree assignment and runs there. |
| `trackFileChanges` | no | Agent actions only. Records the files the run touched. |
| `streaming` | no | Agent actions only. `true` keeps one live provider session across turns. |
| `autoFinish` | no | Agent actions only, requires `streaming`. `{ "state": "<card state>" }` finishes the live session automatically when the card reaches that state. |
| `agent` | no | Agent profile override. Required when `model` is set. |
| `model` | no | Model override. Requires `agent`. |
| `thinkingLevel` | no | `none`, `low`, `medium`, `high`, or `max`. Requires `agent` and `model`. |
| `phrases` | no | Named snippets (`title` + `text`) offered as quick buttons while running the action. |

Unknown fields are rejected at load time rather than silently ignored.

## `appliesTo`

An object of context filters. Every configured filter must match for the action to appear.

| Filter | Matches |
| --- | --- |
| `kind` | Context type, for example `card`, `file`, `folder`. |
| `type` | Card type, for example `feature`, `bug`. |
| `state` | Card status. |
| `file` | File the context points at. |
| `folder` | Folder the context points at. |
| `worktree` | Worktree assignment on the card. |
| `worktreeError` | Worktree problem reported for the card. |

No `appliesTo` means the action is available in every supported context.

```json
"appliesTo": { "kind": "card", "state": "ready for implementation" }
```

## Validation

Definitions are validated when they load and again before they are saved. md² refuses to run or store an action that fails, and shows the error on the offending field. Rejected cases include:

- missing `id`, `label`, `description`, or `type`;
- duplicate or normalization-colliding ids;
- `prompt` on a command action, `command` on an agent action;
- `streaming`, `autoFinish`, or `trackFileChanges` on a command action;
- `autoFinish` without `streaming`, or an `autoFinish.state` that is not a configured column;
- `model` without `agent`, `thinkingLevel` without both;
- an unknown agent profile or a model the profile does not list;
- an invalid regular expression in an `on` condition;
- an unknown action id in `onBefore`, `on`, or `onAfter`;
- a cycle through `onBefore`, `on`, or `onAfter`;
- unknown fields, and the retired fields `after`, `before`, `runIn`, `text`, or type `cmd`.

## Built-in actions

Two actions exist without a file:

| Id | What it does |
| --- | --- |
| `md2.custom-prompt` | Sends whatever you type to the agent. Streaming. Always available in supported contexts. |
| `md2.convert-remarkable-images-to-text` | Transcribes imported images and appends the text to the card. |

They cannot be edited or deleted, and project actions may not reuse their ids.

See also: [Placeholders](placeholders.md), [Running actions](running-actions.md), [Agent setup](agent-setup.md), [Cookbook](cookbook.md).
