# Actions

- list in loaded when project is loaded from the `actions` folder (special type)

- json object containing fields:

  - label
  - description
  - type:
    - agent
    - cmd
  - text: to send to agent or command line to run. Can contain placeholders:
    - rootProjectFolder
    - file (path to markdown file)
  - before: list of sub-actions to do before running this action
  - after: list of actions to run after this action (no matter what the result of the action was)
  - on: list of condition → action pairs.
    - actions are executed if the condition is met.
    - the condition is a regular expression that is executed on the action's output (latest response if type is `agent`).
- sub-actions can be defined inline or as a ref to other action objects.
- When actions are loaded, a check for circular calls needs to be done.
- actions are run by the Electron app.
  The React app also knows all actions since it displays them.

- more fields:
  - icon: path or SVG used for button (optional)
  - appliesTo: a condition that defines when the action is allowed / shown on the UI
    - json object, field-name reference and properties
    - ex:
      - type: feature
      - state: design
  - name: to reference the action in other actions
- example:
  - label: "Implement"
  - description: "Implement this feature"
  - type: agent
  - text:

    ```
    use '/implement-feature' to implement {{file}}
    ```
  - before:

    ```
    [
      createBranch,     // action with cmd to create
      moveToTreeWorktree // action that sets worktree
    ]
    ```
  - after:

    ```
    [
      runLint,          // cmd to run lint on project
                        // -> starts subtask if broken
      runTests
    ]
    ```

- It should also be possible to trigger actions through a state change.
  - example: when a card is dragged to the "implementing" state
    - trigger the "implement" action
    - extra field: `onState: stateName`

---

# UI display

- actions are displayed as closely as possible to the items they relate to.
  - need new field for action: `appliesTo`
    - card → display on any card
    - history → a history card
    - architecture → file in architecture
    - folder → any folder
    - historyFolder → a history folder
    - ...

- when `appliesTo` & `filter` are OK, show action
- on cards:
  - small icon buttons
  - in context menu
  - menu items
- folders: context menu
- files:
  - either local menu or global toolbar
  - perhaps configurable


Here's a transcription of your handwritten notes. I've kept the structure and wording as close as possible while making a few small corrections where the handwriting was ambiguous.

---

# Batch commands

- Configurable folder in the Electron app + also in project for local batch files.
- Folders contain all the batch / PowerShell (.ps1) or bash scripts that can be run as actions.
- Scripts can have parameters.
  - User can provide values during configuration. Placeholder supported.
- Advantages:
  - More complex tasks possible compared to a basic command line.
  - Easier to auto-extend and let the system grow without complex integrations.
    - agent can render script and save it in the specified folder. Perhaps a JSON for some configuration for the related action.
- Electron app monitors changes in the folders.
  - When files get added / removed / changed, related actions get added / deleted / updated.
  - Electron app notifies React that actions have changed.

