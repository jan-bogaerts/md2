---
author: 
id: F_92
internalId: cf144ebc-ebd3-4148-8ad8-99bac886dd3f
title: add markdownPlaceholderPlugin to action input
status: design
owner: 
affects:
agents:
  - design/activity/card__cf144ebc-ebd3-4148-8ad8-99bac886dd3f.json#conversation=agent-36dc93ea-6a9e-46ba-91a9-def33cccdc0a
  - design/activity/card__cf144ebc-ebd3-4148-8ad8-99bac886dd3f.json#conversation=agent-af0f70e2-7ad8-473a-9862-c858ecd84874
policy:
after: 
worktree: 2
---

the Action popup's input is a markdown editor. It should support markdownPlaceholderPlugin so that placeholders can be inserted.
Secondary, custom prompts should also replace the placeholders, this needs to be verified.

## Current state

`MarkdownEditor` always installs `markdownPlaceholderPlugin`, but the Action popup does not pass `ACTION_PROMPT_PLACEHOLDERS`. Its hidden-toolbar editor therefore has no placeholder suggestions.

Electron resolves placeholders while preparing the stored action prompt. The popup then submits the edited text as `runInput.prompt`, which `ActionAgentExecutor` currently sends unchanged. Placeholders added after preparation, including those entered for `Custom prompt` or inserted through a phrase, remain unresolved.

## Implementation details

- Pass `ACTION_PROMPT_PLACEHOLDERS` to the popup's `MarkdownEditor`. Typing `{{` exposes the existing caret typeahead; the format toolbar remains hidden.
- In Electron, run every root `runInput.prompt` through the existing `resolvePlaceholders` function immediately before agent execution. Use the resolved run project, primary project, releases folder, action context, and existing extra-prompt value.
- Keep preview-time resolution. Final resolution is a second, safe pass for placeholders introduced by user edits; already resolved text stays unchanged.
- Do not reapply action-template composition or the tracked-file instruction during the final pass.
- Preserve existing failures for placeholders whose required context is unavailable. Unknown placeholder names remain literal.
- This narrows F_057's exact-prompt rule: submitted text stays exact except for recognized placeholder substitution.

## Acceptance criteria

- Typing `{{` in the Action popup lists the supported action placeholders and selecting one inserts its Markdown token.
- Prepared action prompts still display with stored placeholders resolved.
- Recognized placeholders added to an edited prompt, custom prompt, or phrase are resolved by Electron before the agent starts.
- Already resolved prompt text and tracked-file instructions are not duplicated or otherwise recomposed.
- Missing required placeholder context fails before agent process start; unknown placeholders remain unchanged.
- Tests cover popup placeholder configuration, final resolution of an edited/custom prompt, unchanged prepared text, and missing-context failure.
