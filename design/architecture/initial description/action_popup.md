# Action Popup

- Activating an action entry point opens the popup for the action `id` and selected context.
- The popup is resizable, with its resize handle placed for the popup position.
- The popup shows the action label, description, execution status, phase-specific log, and previous runs.
- Agent actions show run-specific prompt input and agent, model, and thinking-level selection.
- `onBefore` and `onAfter` actions are shown as links. Activating a link opens the related action by `id` with the same context.
- `Run` asks the Electron-side action runner to start the action.
- While the action is running, `Cancel` asks Electron to stop the active process and chain.
- `Schedule` opens the scheduling flow defined in `design\feature_descriptions\ready\F_022_scheduled_actions.md`.
- When custom input was entered, `Convert to action` creates a reusable action definition.
- The built-in `custom prompt` action is always available in supported contexts.
