---
author: 
id: F_270
internalId: d65c7486-a435-44f6-b2a0-3f6dce01fa35
title: add auto finish support for diagram actions
status: ready
owner: 
affects:
agents:
  - design/activity/card__d65c7486-a435-44f6-b2a0-3f6dce01fa35.json
policy:
after: 6ea2e797-b87b-4246-974a-d45ddc3fefc1
changedFiles:
  - app/src/components/actions/editor/action_definition_fields.grouped.test.tsx
  - app/src/components/actions/editor/action_definition_fields.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/diagram_view/diagram_view.test.tsx
  - app/src/components/editor/action_markdown_data_source.node.test.ts
  - app/src/components/merge_conflict_dialog.test.tsx
  - app/src/data/action_context.node.test.ts
  - app/src/data/action_run_types.ts
  - app/src/data/action_types.ts
  - app/src/project_template/actions/complete.json
  - app/src/project_template/actions/implement.json
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_service_helpers.ts
  - app/src/services/actions/action_text.node.test.ts
  - app/src/services/actions/electron_action_runner.node.test.ts
  - app/src/services/diagrams/diagram_data.ts
  - app/src/services/diagrams/diagram_view_service.test.ts
  - app/src/services/diagrams/diagram_view_service.ts
  - app/src/services/open_files_service.node.test.ts
  - app/src/services/search/search_project.node.test.ts
  - app/vitest.grouped.temp.config.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_command_executor.js
  - desktop/src/actions/action/action_definitions.test.mjs
  - desktop/src/actions/action/action_diagram_output_watcher.js
  - desktop/src/actions/action/action_diagram_output_watcher.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_text.js
  - desktop/src/actions/action/action_text.test.mjs
  - shared/action_definitions.d.mts
  - shared/action_definitions.mjs
  - shared/diagram_data.d.mts
  - shared/tolerant_action_definitions.mjs
---

We can automatically finish a streaming agent action when its card enters a configured state. Diagram-producing actions need equivalent support: finish the streaming agent when the generated diagram JSON is ready.

## Current state

There is no explicit diagram-action property. `ActionDefinition.type` only distinguishes `agent` from `command`.

At definition-selection time, Diagram View treats `appliesTo.kind: "diagram"` as the diagram marker and uses `appliesTo.type: "root" | "child"` to select the entry point. At execution time, the runner instead uses `ActionContext.kind === "diagram"` to allocate `diagramPath`, append `diagramFooter`, resolve `{{diagram-file}}`, and return diagram result metadata. Diagram View also identifies completed diagram runs from their context.

This conflates two concerns:

* `appliesTo` describes where an action is available.
* Producing a diagram is behavior owned by the action.

It also causes every linked action to inherit diagram behavior from the root run context, even though linked-action applicability filters are not evaluated.

Command actions currently cannot have `appliesTo.kind: "diagram"`, and command placeholder resolution does not receive `diagramPath`. That conflicts with the required model in which either an agent or a command can produce a diagram.

## Decision

Add an optional action output declaration:

```json
"output": {
  "kind": "diagram"
}
```

An action with `output.kind: "diagram"` is a **diagram action**. An action without `output` is a regular action. `type` remains the execution mechanism (`agent` or `command`), while `appliesTo` remains only an availability filter.

Change `autoFinish` to an explicit trigger union:

```json
"autoFinish": {
  "when": "card-state",
  "state": "ready"
}
```

or:

```json
"autoFinish": {
  "when": "diagram-created"
}
```

`diagram-created` is valid only for a streaming agent diagram action. Command diagram actions complete when their process exits and do not use streaming auto-finish.

For compatibility with existing regular actions, an `autoFinish` object with `state` but without `when` defaults to `card-state` and is normalized to the explicit shape when loaded.

## Implementation details

* Extend the shared raw and resolved action definitions, strict field lists, validation, editor conversion, and serialization with `output`. Accept only `{ kind: "diagram" }`; reject unknown output fields and values.
* Replace the current `{ state }` auto-finish shape with the discriminated shapes above. Update bundled and project-template action definitions to the `card-state` shape. Continue accepting the existing `{ state }` shape as `card-state` at the validation boundary and normalize loaded actions to the explicit shape.
* Allow both agent and command actions to target diagram contexts. Pass the allocated diagram output path into command placeholder resolution so a command diagram action can use `{{diagram-file}}`.
* Allocate `diagramPath`, append `diagramFooter`, and expose diagram result metadata from `output.kind`, not merely from `context.kind`. Append the footer only to diagram agent actions. Regular linked actions keep regular behavior even when the root run has diagram context.
* Diagram View entry points still use `appliesTo` to decide where actions appear, but only `output.kind: "diagram"` declares that their result is a diagram. A diagram action must include `appliesTo.kind: "diagram"`; the reverse is not required, so regular actions may remain available in a diagram context.
* Diagram View records a completed output only when the terminal run identifies a diagram output and supplies its path. It must not infer diagram output from the run context.
* In the action editor, show output kind independently from applicability filters. When a streaming agent has diagram output, the Auto finish controls offer `When diagram is created`; card-state auto-finish continues to offer a state selector. Do not derive the control from the visual position of the filter editor.
* For `diagram-created`, watch the exact allocated output path for the lifetime of the active action. The file is ready only when it can be read and passes the same diagram-data parser used by Diagram View. An absent, partially written, or invalid file does not finish the agent; a later change may be checked again. Stop watching when the action finishes, fails, or is cancelled.
* When readiness occurs before the provider run id is available, retain the existing pending-finish behavior and finish as soon as the provider starts. Finishing remains idempotent and discards queued prompts as card-state auto-finish does.
* A malformed diagram must continue to surface through the existing diagram error flow if the agent ends without producing a valid replacement. File watching failures fail the action with a clear error rather than silently disabling auto-finish.

## Affected components

* Shared action schema and TypeScript declarations.
* Action definition validation, loading, editing, and serialization.
* Action editor output and auto-finish controls.
* Desktop action runner, agent executor, command executor, and run events/results.
* Diagram output-path allocation and placeholder resolution.
* Diagram View action selection and completed-run handling.
* The diagram-data parser, which must be reusable by the desktop readiness check and Diagram View without duplicating validation rules.
* Bundled and project-template actions using the current auto-finish shape.

## Acceptance criteria

* `output.kind: "diagram"` is the sole definition-level distinction between diagram and regular actions; `type` and `appliesTo` keep their separate meanings.
* Diagram actions may be agent or command actions. Commands can target diagram contexts and resolve `{{diagram-file}}`.
* A regular linked action in a diagram-context run does not receive the diagram footer or become a diagram output action.
* A streaming diagram agent configured with `autoFinish.when: "diagram-created"` finishes once its allocated file contains valid diagram JSON.
* Missing, partial, or invalid JSON does not finish the agent. A later valid write does.
* Card-state auto-finish retains its behavior through the explicit `card-state` trigger.
* Existing card-state actions without `autoFinish.when` load as `card-state` actions without validation errors.
* Invalid combinations and unknown fields fail validation with field-specific errors.
* Diagram View records only successful diagram outputs and does not infer them from `ActionContext.kind`.
* Focused shared, app, and desktop tests cover schema validation, editor behavior, agent and command diagram actions, linked regular actions, file readiness, cleanup, and unchanged card-state behavior.

## Out of scope

* Additional output kinds.
* Auto-finishing command processes when they create a file.
* Changing diagram root/child navigation or index structure.
