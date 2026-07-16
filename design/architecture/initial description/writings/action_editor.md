# Action editor

## Responsibility

- The action editor creates and edits JSON-backed action definitions.
- Action definitions are always edited through structured controls. Raw JSON is not shown or edited.
- The action service owns the loaded action objects and is the source of truth for display. JSON serialization only happens when a valid action is saved.
- Each loaded action object retains its source-file path as service metadata. The tree and tabs use the action objects and this metadata, not reparsed JSON strings.
- Action definitions can be edited in both web and desktop mode.
- Running actions is a separate concern described in [Running actions](<running_actions.md>).

## Opening actions

- Action JSON files are shown in the actions folder in the text-view tree.
- Selecting an action from the tree opens its action editor in a text-view tab. Selecting an already open action activates the existing tab.
- The `New action` command on the Run tab of the application toolbar creates an action and opens it in a text-view tab.
- A new action receives an automatically generated `id` and prefilled values for all required fields.
- The built-in `custom prompt` action is not a project file and is not shown in the tree or opened in an editor tab.
- Selecting an action search result depends on the current view:
  - card view opens the action popup;
  - text view opens the action editor tab.

## Tab layout

- Markdown files and action JSON objects share the text-view tab system.
- A structured field box is shown at the top of the tab content:
  - for Markdown files, it contains the Markdown header fields;
  - for actions, it contains the action-definition fields.
- A Markdown editor is shown below the field box for:
  - the body of a Markdown file;
  - the `prompt` of an agent action.
- Agent prompt editors provide toolbar insertion and `{{` typeahead for `{{card-file}}`, `{{card-prompt}}`, and `{{rootProjectFolder}}`.
- Command actions do not show a Markdown editor. Their command-specific values are edited through structured controls in the field box.
- Controls that do not apply to the selected action type are hidden.

## Action definition

| Field | Rule |
| --- | --- |
| `id` | Required, generated when the action is created, and stable for the lifetime of the action. Used by `onBefore` and `onAfter` references. |
| `name` | Required action name. |
| `label` | Required user-facing label. |
| `description` | Required description of the action. |
| `type` | Required. Supported values are `agent` and `command`. |
| `icon` | Optional icon shown by action entry points. |
| `appliesTo` | Optional structured filters that determine the contexts in which the action is available. |
| `onBefore` | Optional ordered list of action `id` values to run before this action. |
| `on` | Optional ordered list of regular-expression conditions paired with an action `id`. A matching action runs against this action's output. |
| `onAfter` | Optional ordered list of action `id` values to run after this action. |
| `onState` | Optional card state that starts this action when a card receives that state. |
| `needsWorkTree` | Optional boolean. When set, execution requires card context with a valid worktree assignment from the configured worktree list. |
| `agent` | Optional agent override. When omitted, the application default agent is used. Required when `model` or `thinkingLevel` is set. |
| `model` | Optional model override for the explicitly selected `agent`. |
| `thinkingLevel` | Optional thinking-level override for the explicitly selected `agent` and `model`. |
| `prompt` | Required Markdown prompt for an `agent` action. |
| `command` | Required command line for a `command` action. |

- `id`, rather than `name`, is used for links so renaming an action does not break action chains.
- `onBefore`, `on`, and `onAfter` use action selectors. The UI displays action labels but persists their `id` values.
- Structured controls are also used for icons, filters, action links, agent selection, model selection, and thinking-level selection.

## Applicability filters

- `appliesTo` is edited as a set of structured filters, not as raw JSON.
- Every configured filter must match the current action context for the action to be available.
- Filterable context includes the target kind, card type, card state/status, file, folder, and other context fields exposed by the action context model.
- Example: `kind = card` and `state = new` makes the action available only for cards whose current status is `new`.
- An action without `appliesTo` filters is available in every supported context.

## Agent capabilities

- Each configured agent profile owns its available model list. Built-in Codex and Claude profiles provide default model lists.
- Model discovery does not call OpenAI or Claude provider APIs and does not require provider API credentials.
- `model` remains disabled until an explicit `agent` with a valid, non-empty model list is selected.
- Thinking-level choices are the fixed values `none`, `low`, `medium`, `high`, and `max`. `none` means no thinking-level override.
- `thinkingLevel` remains disabled until an explicit `agent` and `model` are selected.
- Agent availability, profile models, fixed thinking levels, and capability errors are owned by an agent-capabilities service rather than by the editor component.
- Missing or malformed profile capabilities are shown next to the affected control and are not replaced silently.

## Validation and saving

- Editor state is a structured action object. The UI never treats serialized JSON as editable state.
- Required fields are prefilled for a new action and cannot be saved with an empty value.
- Validation runs as fields change and again before auto-save serializes the object.
- Invalid actions are not written and do not replace the valid object in the action service.
- The relevant input is shown in an error state with helper text containing the actual error.
- Validation follows the action rules from F-010, including:
  - required fields;
  - duplicate names and identifiers;
  - unknown action references;
  - self-references and circular `onBefore`/`on`/`onAfter` chains;
  - invalid regular expressions in fields that accept them;
  - invalid action types;
  - invalid agent, model, or thinking-level combinations.
- After a successful save, the action service publishes the updated object so the tree, search, action entry points, open tabs, and execution UI use the same definition.

## Electron boundary

- Editing persists action definitions through the active project storage service in web and desktop mode.
- The renderer does not execute `command` or `prompt` directly or pass executable definition data to the desktop bridge.
- An execution request identifies the persisted action by `id` and supplies its context and run-specific input. The Electron-side action runner resolves, validates, and executes the stored definition and its linked actions.
