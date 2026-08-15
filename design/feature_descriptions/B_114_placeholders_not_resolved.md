---
author: 
id: B_114
internalId: 4e0cc180-caab-4998-bb3f-63411cfa21de
title: Placeholders not resolved
status: ready
owner: 
affects:
agents:
  - design/activity/card__4e0cc180-caab-4998-bb3f-63411cfa21de.json#conversation=agent-4c1d47fa-4a80-4efa-a6bb-9ed7e9b769ac
  - design/activity/card__4e0cc180-caab-4998-bb3f-63411cfa21de.json#conversation=agent-c78aad14-a134-47d7-bd05-96cc47d8f7c7
policy:
after: 2433b65f-efed-4a22-af41-529cd35af655
---
When user types in a placeholder in the input box of the action popup, it is not resolved apparently, when sent to the engine

## Current state

Agent popup uses one Markdown prompt editor for initial prompts and later messages. Desktop prepares initial prompt by loading persisted action definition and resolving its placeholders. On initial run or process restart, renderer sends edited text as `runInput.prompt`; `ActionAgentExecutor` resolves recognized placeholders before starting agent process.

Active streaming follow-up uses different path. Renderer stores draft through queued-message bridge, then `ActionRun` forwards content directly to `agentRunnerService`. No placeholder resolver runs, so engine receives literal token such as `{{card-file}}`. Here, **engine** means agent process or provider receiving user message.

Desktop `action_text.js` owns authoritative action placeholder resolution. Resolution is one pass: recognized tokens in submitted text resolve once; unknown tokens remain unchanged. `{{worktree-folder}}` must use checkout where active agent runs, while repository, project, releases, active-cards, and card values come from run context.

## Implementation details

* Define **popup-entered placeholder** as recognized `{{name}}` token typed or inserted into editable agent prompt after popup opens.
* Keep resolution in desktop host. Renderer continues sending text and context, never executable resolved prompt data.
* Add single desktop helper in `action_text.js` for popup-entered prompt text. It must call existing one-pass placeholder resolver with empty `card-prompt` value. Thus context and folder placeholders resolve, `{{card-prompt}}` becomes empty instead of recursively expanding itself, and unknown tokens remain literal.
* Use helper for every agent message delivery path: initial `runInput.prompt`, restarted-process prompt, direct streaming message, and queued streaming message before content reaches `agentRunnerService`.
* Keep action-definition behavior unchanged. `resolveAgentPrompt` still resolves persisted template and inserts or appends run-specific input once; do not run second recursive replacement over resolved values.
* While agent action is active, retain exact execution project used by `actionWorktreeRunService`. Use it to resolve `{{worktree-folder}}`; clear it when active action ends. Continue using primary project for `{{repository-folder}}`, `{{project-folder}}`, `{{releases-folder}}`, and `{{active-cards-folder}}`.
* Missing required context or folder value must fail before message dispatch with existing clear resolver error. Failed submission must not send literal placeholder or clear user's draft.
* Keep popup editor, placeholder typeahead, prompt preparation, questions, approvals, phrase buttons, conversation continuation, and command execution behavior unchanged.
* Add focused tests in desktop `action_text`, `action_agent_executor`, and `action_run` suites. Cover initial, restart, direct streaming, queued streaming, linked-worktree resolution, unknown token, missing required value, and `{{card-prompt}}` self-reference behavior.

## Acceptance criteria

* On initial agent run, recognized placeholder typed in popup prompt resolves before engine receives message.
* On process restart, recognized placeholder in submitted prompt resolves before new process receives message.
* During active streaming run, both direct and queued follow-up messages resolve recognized placeholders before engine receives them.
* `{{worktree-folder}}` resolves to active action checkout. Other folder placeholders resolve from opened repository and configured folders as documented.
* Card placeholders resolve from popup run context. Missing required card or folder value blocks dispatch and preserves draft with clear error.
* `{{card-prompt}}` typed into popup prompt resolves to empty text and does not recurse. Placeholder-like text produced by resolved value is not processed again.
* Unknown placeholder names remain unchanged.
* Persisted/displayed user message matches resolved text sent to engine; literal recognized token is not recorded as delivered content.
* Existing action-template resolution, initial prompt preparation, continuation, questions, approvals, command actions, and placeholder typeahead keep current behavior.
