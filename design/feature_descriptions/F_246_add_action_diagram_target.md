---
author: 
id: F_246
internalId: 8df7d3db-c367-4792-b4f9-a9bd3ec9d674
title: add action diagram target
status: ready
owner: 
affects:
agents:
  - design/activity/card__8df7d3db-c367-4792-b4f9-a9bd3ec9d674.json
policy:
changedFiles:
  - app/src/App.test.tsx
  - app/src/app/use_app_bootstrap.test.ts
  - app/src/components/actions/agent/action_agent_prompt.test.tsx
  - app/src/components/actions/conversation/action_conversation_link_navigation.node.test.ts
  - app/src/components/actions/conversation/action_conversation_store.node.test.ts
  - app/src/components/actions/editor/action_filter_editor.grouped.test.tsx
  - app/src/components/actions/editor/action_filter_editor.tsx
  - app/src/components/actions/run/popup/action_popup.test.tsx
  - app/src/components/actions/run/popup/action_popup_defaults.node.test.ts
  - app/src/components/actions/run/popup/action_popup_defaults.ts
  - app/src/components/actions/run/popup/action_popup_operations.ts
  - app/src/components/config/config_value_editor.grouped.test.tsx
  - app/src/components/config/config_value_editor.tsx
  - app/src/components/editor/markdown_placeholder_menu.grouped.test.tsx
  - app/src/components/hooks/use_project_config.test.ts
  - app/src/components/shell/project/project_dialogs.test.tsx
  - app/src/components/shell/project/project_folder_setup_fields.tsx
  - app/src/components/shell/remote_connect_button.grouped.test.tsx
  - app/src/data/action_context.node.test.ts
  - app/src/data/action_context.ts
  - app/src/data/action_placeholders.ts
  - app/src/data/action_run_types.ts
  - app/src/data/data_types.ts
  - app/src/data/electron_action_bridge.ts
  - app/src/services/actions/action_prompt_draft_service.node.test.ts
  - app/src/services/actions/action_prompt_draft_service.ts
  - app/src/services/actions/action_run_registry.node.test.ts
  - app/src/services/actions/action_run_registry.ts
  - app/src/services/actions/action_service.node.test.ts
  - app/src/services/actions/action_text.node.test.ts
  - app/src/services/actions/action_text.ts
  - app/src/services/config/config_entries.ts
  - app/src/services/config/config_service.service.test.ts
  - app/src/services/config/config_service.ts
  - app/src/services/project/project_loading.test.ts
  - app/src/services/project/project_session_service.service.test.ts
  - app/src/services/project/project_session_service.ts
  - desktop/src/actions/action/action_agent_executor.js
  - desktop/src/actions/action/action_definitions.test.mjs
  - desktop/src/actions/action/action_diagram_output.js
  - desktop/src/actions/action/action_diagram_output.test.mjs
  - desktop/src/actions/action/action_run.js
  - desktop/src/actions/action/action_run_request.js
  - desktop/src/actions/action/action_run_request.test.mjs
  - desktop/src/actions/action/action_runner_service.js
  - desktop/src/actions/action/action_runner_service.test.mjs
  - desktop/src/actions/action/action_scheduler_service.js
  - desktop/src/actions/action/action_scheduler_service.test.mjs
  - desktop/src/actions/action/action_text.js
  - desktop/src/actions/action/action_text.test.mjs
  - shared/action_definitions.mjs
---
We can link actions to different types of targets like cards, project, merge,... we need a new target: diagram. these actions are available in diagram mode.

See F\_262

A diagram action needs to inforce that the output is an svg and that the diagram skill is used.

To make this work, we add to project config section, a new config value ´diagram footer´, which is a markdown text added to every diagram prompt.

The prompt should contain instruction on where to save file, this is done with new placeholder ´diagram-file´

When action is started, we calculate filename and pass to prompt resolver.

## Current state

Action targets are represented by `ActionContext.kind`. Renderer supports `card`, `file`, `folder`, `merge-conflict`, and `project`; Electron validates the same set. `appliesTo` can filter actions by `kind` and `type`, but no diagram context exists, so no action can be opened specifically for diagram view. F\_262 diagram view is not implemented.

Renderer and Electron prompt resolvers support card, folder, and merge-conflict placeholders. They do not recognize `{{diagram-file}}`. Project config has no diagram footer, default, editor field, validation, or action-runner value. Existing SVG support only loads SVG files as project assets; it does not generate them.

## implementation details

* Add `diagram` to renderer and Electron action-context kinds. Diagram view supplies `type: 'root'` for top-level actions and `type: 'child'` for drill-down actions. Definitions select them with `appliesTo: { kind: 'diagram', type: 'root' | 'child' }`. Add `diagram`, `root`, and `child` to relevant action-filter editor choices. Reject command actions whose `appliesTo.kind` is `diagram`, because footer and output-path rules apply to agent prompts.
* Add `diagramFooter: string` to `ProjectConfig` and `project.diagramFooter` to Project config UI as multiline Markdown. Default footer is: `Use the diagram skill. Create SVG output and save it to {{diagram-file}}.` Projects may replace this complete text. Runtime must not inject separate SVG or skill instructions and must not inspect footer wording.
* Preserve `diagramFooter` through defaults, config loading, validation, editing, saving, and Electron action-runner setup. Require a non-empty string containing `{{diagram-file}}`; this guarantees configured footer can identify output location without prescribing its other instructions.
* Add `diagram-file` to supported prompt placeholders and editor insertion choices. Resolve it only for diagram context; use elsewhere fails with a clear error. Resolve to absolute path in active run checkout, under configured project folder.
* Generate path when diagram prompt is first prepared, because action popup must show resolved prompt before run. Reuse that path when prepared prompt starts. If action starts without preparation, generate path at start. Filename is sanitized action label, hyphen, filesystem-safe UTC timestamp with milliseconds, then `.svg`; for example `Project-overview-20260831T142530123Z.svg`. Replace Windows-invalid characters and whitespace runs with hyphens. Each new run gets new filename.
* Append footer after action prompt, separated by blank line, before placeholder resolution. Prepared root prompts and directly executed or chained diagram prompts use same composition helper, so footer appears exactly once. Non-diagram prompts remain unchanged.
* Return generated repository-relative diagram path with prepared prompt and action result metadata so F\_262 can load created file without parsing prompt text. Continue storing diagram-action conversations in project activity; diagram persistence and navigation remain F\_262 scope.
* Add focused tests for definition validation, context matching, config defaults/load/save/validation, placeholder errors and resolution, filename sanitization and uniqueness, footer placement, no duplication, prepared/direct/chained runs, and unchanged non-diagram prompts. Run affected app and desktop tests plus app and desktop lint.

## acceptance criteria

* Agent actions filtered by diagram `root` or `child` appear only for matching diagram context. Command actions cannot target diagrams.
* Project settings load, edit, and save multiline `diagramFooter`. Missing, empty, or footer without `{{diagram-file}}` is rejected with field-specific error.
* Default footer instructs agent to use diagram skill, create SVG, and save it at `{{diagram-file}}`. Replacing footer replaces those instructions; no hidden instruction is added.
* Opening diagram action resolves one output path before prompt is shown. Starting that prepared action uses same path. Starting another run creates new path.
* Output path is inside configured project folder in active checkout. Filename contains sanitized action label, UTC timestamp with milliseconds, and `.svg` extension.
* `{{diagram-file}}` resolves to absolute output path for diagram prompts and fails outside diagram context. Resolved repository-relative path is returned separately for diagram loading.
* Every initial or chained diagram agent prompt contains configured footer exactly once after action text. Card, file, folder, merge-conflict, and project prompts are unchanged.
* Focused app and desktop tests pass; app and desktop lint pass.
