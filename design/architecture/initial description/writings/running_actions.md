# Running actions & agents

## Responsibility

- The execution UI starts actions and shows their live and previous results.
- Editing an action definition remains the responsibility of the [Action editor](<action_editor.md>).
- Actions can only execute through Electron. The Electron-side action runner owns definition lookup, validation, placeholder resolution, chaining, process execution, cancellation, and execution status.
- The action popup and conversational panel use the same live execution state.
- Persisted action history is displayed by these surfaces but its storage model is outside this document.
- Scheduling is defined separately in [Scheduled actions](<../../../../feature_descriptions/ready/F_022_scheduled_actions.md>).
- The global running-actions indicator is defined by [App layout](<../../../../feature_descriptions/ready/F_004_app_layout.md>) and [Running-agent visibility](<../../../../feature_descriptions/ready/B_009_running_agents_visibility.md>).

## Execution request

- The renderer requests a run with the action `id`, context, and run-specific input.
- The Electron-side action runner loads the persisted definition by `id`. Action names and labels are not identifiers and may be changed safely.
- The action runner rejects an unknown `id`, an invalid context, invalid run-specific input, or a definition that is no longer valid.
- The renderer never supplies an action command, prompt template, chain definition, or other executable definition data.

## Execution flow

- On app start:
  - check whether the supported Codex and Claude executables are available and enable or disable them accordingly;
  - load each agent's model list from its configured profile.
- Built-in Codex and Claude profiles provide default model lists. Profiles can override those lists without requiring a provider API or API credentials.
- Thinking-level choices are `none`, `low`, `medium`, `high`, and `max`. `none` means that no thinking-level override is passed to the agent.
- Before an action starts, mark it as `running` so every execution surface can show its state.
- For an agent action:
  - resolve placeholders in its `prompt`;
  - combine the resolved prompt with run-specific prompt input;
  - apply the selected agent, model, and thinking level;
  - start the agent process from Electron;
  - run one structured subprocess for the current turn;
  - stream parsed provider events to shared execution state and persisted conversation log;
  - disable additional conversation input until that process exits.
- For a command action:
  - resolve placeholders in its `command`;
  - start the command from Electron;
  - stream its output to the same execution state and log model.
- A zero exit completes the action. Process-start errors, non-zero exits, streaming errors, or explicit cancellation produce the corresponding non-success execution state.

## Worktree preparation

- An action definition can set `needsWorkTree` when it must run in a dedicated Git worktree.
- When `needsWorkTree` is not set, the action runs in the currently opened project folder.
- When `needsWorkTree` is set, the action requires card context and a valid worktree assignment on that card.
- The card's one-based worktree value selects a folder from Git's current linked-worktree list.
- A missing assignment, invalid index, unavailable folder, or non-card context rejects the run before a process starts and shows the validation error.
- Action execution never creates, registers, or assigns a worktree.
- Worktree preparation does not automatically commit, push, merge, cherry-pick, or transfer changes. Those operations only happen when the user defines and runs explicit actions for them; their failures are normal action failures shown in the execution UI.

## Card execution state

- A card keeps an in-memory `currentAction` while an action is running for that card.
- When `currentAction` is set, every action entry point for that card is disabled.
- `currentAction` is not written to the card or otherwise persisted. On app start, no card has a current action.
- Completion, failure, or cancellation clears `currentAction`, publishes an execution-state event, and updates the UI.

## Application-level triggers

- `onState` starts an action when a card receives its configured state.
- Example: moving a card to `Ready` can start an explicit push action.
- State-triggered actions use the same Electron-side action runner, card execution state, logs, errors, and cancellation behavior as manually started actions.
- Accepted limitation: `onState` detection runs in the renderer while the application has a loaded project snapshot. Card-state changes written by an external process do not trigger actions.

## Action popup

- Activating an action entry point for a card, file, folder, or supported context opens the action popup for that action and context.
- The popup is resizable and contains the action label, description, run controls, status, log, history, and links to its `onBefore` and `onAfter` actions.
- Agent actions also provide run-specific prompt input and agent, model, and thinking-level selection. Definition values are preselected; run-specific changes do not modify the action definition.
- `Run` starts the action.
- While an action is running, `Cancel` asks Electron to stop the active process and chain.
- `Schedule` delegates to the separate scheduled-actions flow.
- Running, completed, failed, cancelled, and `okButNotAfter` states remain visible in the popup.

## Conversational panel

- In text view, the conversational panel is attached to the active Markdown file or card.
- The panel can be opened and collapsed from the editor toolbar.
- On desktop, a horizontal splitter resizes the panel.
- On mobile, the panel has a fixed layout and no splitter.
- The panel shows the active action execution and the same action history available in the popup.
- For a running agent action, structured output is streamed into the conversation and input is disabled.
- After a turn finishes, submitted input starts another one-shot process in the same conversation. The form permits selecting another configured agent.
- Native resume always uses an explicit provider id. Provider switches receive full or cursor-relative normalized history through stdin.
- Command actions show their execution status and log without agent chat controls.

## Chained actions

- `onBefore` contains an ordered list of action `id` values. These actions run before the selected action.
- `on` contains an ordered list of regular-expression conditions paired with an action `id`. Matching actions run after the selected action using its output.
- `onAfter` contains an ordered list of action `id` values. These actions run after the selected action.
- Every linked action is resolved by `id` and runs through the same Electron-side action runner.
- The execution UI identifies each action and phase in the shared log rather than presenting the chain as one undifferentiated result.
- Circular chains and invalid regular expressions are rejected during definition validation and again before execution.

## Chain failure results

- If an `onBefore` action fails, stop the chain before the selected action and mark the selected run as `failed`.
- If the selected action fails, stop the chain, mark the selected run as `failed`, and do not run `on` or `onAfter` actions.
- Matching `on` actions run in order after the selected action succeeds. If one fails, stop the chain, mark the selected run as `failed`, and do not run remaining `on` or `onAfter` actions.
- `onAfter` actions start only after the selected action and every matching `on` action succeed.
- If an `onAfter` action fails, stop the chain before later `onAfter` actions, mark the failed linked action as `failed`, and mark the selected run as `okButNotAfter`.
- Failure details remain attached to the action and phase that failed.

## Availability and errors

- Action definitions remain editable in web mode.
- Run, cancel, and live-input controls require an Electron execution backend. A browser using the Electron remote-control bridge still executes on Electron.
- Controls are disabled with a clear explanation when no Electron execution backend is available.
- Agent capability failures, invalid run-time selections, Git preparation failures, process-start failures, non-zero exits, cancellation failures, streaming failures, and history-loading failures are shown to the user and retained in the execution state where applicable.

## Electron boundary

- The renderer sends only the action `id`, context, and run-specific input.
- Electron resolves the persisted action definition, linked action ids, placeholders, agent configuration, `prompt`, and `command`.
- Command and agent processes are started and controlled by Electron.
