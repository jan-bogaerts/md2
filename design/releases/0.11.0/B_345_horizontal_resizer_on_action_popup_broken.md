---
author: 
id: B_345
internalId: 1fd111b2-7f00-4b67-a356-4d6ec2a4f7d7
title: horizontal resizer on action popup broken
status: ready
owner: 
affects:
agents:
  - design/releases/0.11.0/card__1fd111b2-7f00-4b67-a356-4d6ec2a4f7d7.json
policy:
changedFiles:
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/agent/action_agent_prompt.tsx
---

The resizer on the action popup is broken. it is no longer possible to resize it. This used to work, got broken with recent refactors

## Current state

`ActionInputSplitter` starts the drag and updates `ActionInputLayoutStore` correctly. The store publishes the changed prompt height, and the prompt receives that height, but the visible layout does not change.

`ActionAgentPrompt` currently gives the prompt box `flex: 1` when no questions are shown. The resulting `flex: 1 1 0%` sizing overrides the explicit splitter-controlled height. Before the layout refactor, the prompt box used `flexShrink: 0`, so its explicit height controlled its rendered size. Both command and agent action popups use this prompt-only layout.

Existing tests verify the stored value and inline height, but they do not verify that the flex layout remains height-driven.

## Implementation details

* Use `flex: 1` only for the automatic questions layout, where the prompt must fill the remaining space.
* Use `flex: 0 0 auto` for prompt-only layouts and manually sized question layouts so the splitter-controlled height determines the rendered size.
* Keep `ActionInputSplitter`, `ActionInputLayoutStore`, drag direction, height limits, persistence keys, and empty-prompt disabling behavior unchanged.
* Add focused coverage proving that an enabled prompt-only splitter changes a height-driven prompt box for both command and agent actions. Keep the existing question-layout coverage.

## Acceptance criteria

* Dragging the enabled horizontal splitter resizes the prompt in command action popups.
* Dragging the enabled horizontal splitter resizes the prompt in agent action popups without questions.
* Automatic question layouts continue to allocate the remaining space with flex sizing.
* Manually resized prompt-and-question layouts continue to honor their stored block height.
* Empty prompt-only inputs keep the splitter disabled, and existing minimum, maximum, and persistence behavior remains unchanged.
