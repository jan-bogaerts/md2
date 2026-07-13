# Agents

- Agent processes only run through Electron.
- Agent outputs are stored in JSON conversation logs referenced by Markdown files.
- Cards and the editor can show the conversations associated with the current card or file.
- While an agent is running:
  - stdout and stderr are streamed into the visible conversation;
  - text submitted by the user is forwarded to the active process through stdin;
  - cancelling the action stops the Electron process and marks the run cancelled.
- After an agent finishes, submitted conversation input starts or resumes a linked agent run. It is not sent to the completed process.
- Every finished conversation provides a single-click `Continue` action that sends `continue` as the continuation input.
- On cards, an indicator shows running actions and available conversations.
- In the editor, a toolbar button opens the conversational panel below the active file. Desktop uses a horizontal splitter; mobile uses a fixed layout.
- The global running-actions indicator is defined by `design\feature_descriptions\ready\F_004_app_layout.md` and `design\feature_descriptions\ready\B_009_running_agents_visibility.md`.
