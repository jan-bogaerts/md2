# Placeholders

{% raw %}

Placeholders let one action definition work for every card. They are written as `{{name}}` and resolved on the desktop side, just before the process starts.

| Placeholder | Resolves to |
| --- | --- |
| `{{card-file}}` | Path to the selected card's Markdown file. |
| `{{this-card}}` | Alias of `{{card-file}}`; the same path to the selected card's Markdown file. |
| `{{card-title}}` | Title of the selected card. |
| `{{card-prompt}}` | The extra text you typed in the action popup for this run. |
| `{{active-cards-folder}}` | Absolute path to the configured working folder under the opened repository. Active cards are root-level Markdown files in this folder shown on the dashboard. |
| `{{worktree-folder}}` | Absolute path to the action execution checkout. |
| `{{repository-folder}}` | Absolute path to the opened repository. |
| `{{project-folder}}` | Absolute path to the configured `project.projectFolder` under the opened repository. Equal to `{{repository-folder}}` when configuration is empty. |
| `{{releases-folder}}` | Absolute path to the configured releases folder under the opened repository. |

They work in both `prompt` (agent actions) and `command` (command actions).

## Using them

In the prompt editor, type `{{` for a typeahead list, or insert one from the toolbar.

```json
{
  "id": "fix-bug",
  "label": "Fix bug",
  "description": "Fix the bug described on the card",
  "type": "agent",
  "prompt": "Fix the bug described in {{card-file}}.\n\nExtra instructions: {{card-prompt}}"
}
```

```json
{
  "id": "open-in-editor",
  "label": "Open in VS Code",
  "description": "Open the card file in VS Code",
  "type": "command",
  "command": "code {{card-file}}"
}
```

## Notes

- A card placeholder only resolves when the action runs with card context. Use `appliesTo` with `"kind": "card"` so an action that needs `{{card-file}}` or `{{this-card}}` is only offered where it makes sense.
- `{{card-prompt}}` is empty when you run without typing anything. Write prompts that read fine either way.
- During linked-worktree actions, `{{repository-folder}}`, `{{project-folder}}`, and `{{active-cards-folder}}` remain under the opened repository. Only `{{worktree-folder}}` changes to the linked worktree.
- The diff command in project configuration supports the same five folder placeholders plus `{{commit}}`, `{{branch}}`, and `{{file}}`. For diffs, `{{worktree-folder}}` and `{{repository-folder}}` both resolve to the opened repository.
- Custom agent profiles support `{{model}}` in `command` and `{{sessionId}}` in `resumeCommand`. Those are profile placeholders, not action placeholders.

{% endraw %}

See also: [Action definition](action-definition.md), [Cookbook](cookbook.md).
