# Action cookbook

{% raw %}

Copy-paste starting points. Save each one as a JSON file in the project's actions folder, or build the same thing in the action editor.

## Implement a feature in its worktree

```json
{
  "id": "implement",
  "label": "Implement",
  "description": "Implement the feature described on this card",
  "type": "agent",
  "prompt": "Read and implement the feature/job described in {{card-file}}.\n\nOnly touch what the description requires. When done, update the `status` field in the card header and print a one sentence commit message.\n\n{{card-prompt}}",
  "needsWorkTree": true,
  "appliesTo": { "kind": "card" },
  "onAfter": ["commit"]
}
```

## Commit as a command action

No agent, no tokens.

```json
{
  "id": "commit",
  "label": "Commit",
  "description": "Commit all changes in the project folder",
  "type": "command",
  "command": "git -C {{worktree-folder}} add -A && git -C {{worktree-folder}} commit -m \"{{card-title}}\""
}
```

## Run the tests

```json
{
  "id": "test",
  "label": "Run tests",
  "description": "Run the project test suite",
  "type": "command",
  "command": "npm test --prefix {{worktree-folder}}"
}
```

## Retry the agent when the tests fail

Chain the test run behind the agent, and route failures back to a fix action with an `on` rule.

```json
{
  "id": "implement-and-verify",
  "label": "Implement and verify",
  "description": "Implement the card, then run the tests",
  "type": "agent",
  "prompt": "Implement {{card-file}}.",
  "needsWorkTree": true,
  "onAfter": ["test"],
  "on": [
    { "condition": "\\b\\d+ (failed|failing)\\b", "actionId": "fix-failing-tests" }
  ]
}
```

Conditions are JavaScript regular expressions (compiled with the `u` flag) matched against the action's output; for agent actions that is the latest response. Inline flags such as `(?i)` are not valid — write the alternatives out.

## Bug-only action

`appliesTo` keeps it off feature cards.

```json
{
  "id": "reproduce-bug",
  "label": "Reproduce",
  "description": "Write a failing test that reproduces this bug",
  "type": "agent",
  "prompt": "Write a failing test that reproduces the bug in {{card-file}}. Do not fix it yet.",
  "appliesTo": { "kind": "card", "type": "bug" }
}
```

## Push when a card reaches a state

Dragging a card to `ready` fires this automatically.

```json
{
  "id": "push-on-ready",
  "label": "Push",
  "description": "Push the current branch",
  "type": "command",
  "command": "git -C {{worktree-folder}} push",
  "onState": "ready"
}
```

## Live design conversation

Streaming keeps one session alive so you can steer, and auto-finish closes it once the card moves on.

```json
{
  "id": "design",
  "label": "Design",
  "description": "Work out the design of this card together",
  "type": "agent",
  "prompt": "Let's design {{card-file}}. Ask me questions before writing anything.",
  "streaming": true,
  "autoFinish": { "state": "ready for implementation" },
  "phrases": [
    { "title": "go", "text": "Looks good, write it into the card." },
    { "title": "shorter", "text": "Too verbose. Keep every detail, cut the words." }
  ]
}
```

## Open the card in VS Code

```json
{
  "id": "open-in-vscode",
  "label": "Open in VS Code",
  "description": "Open this card's file in VS Code",
  "type": "command",
  "command": "code {{card-file}}",
  "appliesTo": { "kind": "card" }
}
```

{% endraw %}

See also: [Action definition](action-definition.md), [Placeholders](placeholders.md), [Running actions](running-actions.md).
