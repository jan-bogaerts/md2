# Placeholders

{% raw %}

Placeholders let one action definition work for every card. They are written as `{{name}}` and resolved on the desktop side, just before the process starts.

| Placeholder | Resolves to |
| --- | --- |
| `{{card-file}}` | Path to the selected card's Markdown file. |
| `{{card-title}}` | Title of the selected card. |
| `{{card-prompt}}` | The extra text you typed in the action popup for this run. |
| `{{rootProjectFolder}}` | Absolute path to the local project root. |

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

- A card placeholder only resolves when the action runs with card context. Use `appliesTo` with `"kind": "card"` so an action that needs `{{card-file}}` is only offered where it makes sense.
- `{{card-prompt}}` is empty when you run without typing anything. Write prompts that read fine either way.
- The diff command in project configuration has its own placeholder set: `{{rootProjectFolder}}`, `{{commit}}`, `{{branch}}`, `{{file}}`.
- Custom agent profiles support `{{model}}` in `command` and `{{sessionId}}` in `resumeCommand`. Those are profile placeholders, not action placeholders.

{% endraw %}

See also: [Action definition](action-definition.md), [Cookbook](cookbook.md).
