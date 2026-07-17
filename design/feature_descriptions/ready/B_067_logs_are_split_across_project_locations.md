---
id: B-067
title: logs are split across project locations
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem

MD² stores its logs in two unrelated locations:

- agent conversations under `<repository>/.md2-agent-logs/`;
- action run history under `<repository>/<projectFolder>/<actionsFolder>/.md2-action-history/`.

This storage layout was not requested. Logs are project data and must have one predictable location.

## Required behavior

- Store all MD²-generated logs under `<repository>/<projectFolder>/logs/`.
- This includes agent conversation logs and action run-history logs.
- Do not create `.md2-agent-logs` at repository root or `.md2-action-history` under the actions folder.
- Keep persisted card conversation references valid and in the `<projectFolder>`, a subfolder of the repository's root, for example `design/logs/<conversation-file>.json` when `projectFolder` is `design`.
- Treat `logs` as a special hidden folder. It must not appear in the list-view file tree, even when repository-file discovery returns its files.
- Hiding `logs` applies only to list-view navigation. Log loading, conversation continuation, run-history loading, Git operations, worktree execution, and file watching must continue to use the files.
- Resolve the folder from configured `projectFolder`; do not assume repository root or working folder. An empty `projectFolder` resolves to `<repository>/logs/`.

## File naming

Use one readable filename format for each log type:

```text
conversation__card__<scope>__<conversation_id>.json
conversation__project__<conversation_id>.json
history__card__<scope>__<action_id>.json
history__project__<action_id>.json
```

Examples:

```text
conversation__card__active_f_4_someting_cool_again__482c00d7_ecda_40f9_ac88_e1bc719ee6aa.json
conversation__project__1c64c2c7_6a02_42b7_ab08_fdc15f189ae8.json
history__card__active_f_1__3401787f_ff10_42fe_a6d3_0697d9cd6db5.json
history__card__active_f_1__md2_custom_prompt.json
```

Naming rules:

- Use lowercase letters, digits, and underscores only before the extension.
- Use one underscore inside a value and two underscores between semantic sections.
- Do not use hyphens in filenames; UUID hyphens become underscores.
- Remove the configured `projectFolder` prefix from the scope.
- Strip the source file extension, such as `.md`, before normalizing the scope.
- Replace each run of remaining non-alphanumeric characters with one underscore and trim leading or trailing underscores.
- The only period in a filename is the one before `.json`.
- Use the complete conversation id for conversation-log uniqueness.
- Use the action's unique id for action-history identity; do not add a hash or another generated id.
- Action ids are unique as raw values, but current validation permits different ids that normalize to the same filename, such as `a.b`, `a-b`, and `a_b`. Reject action graphs containing normalized action-id collisions.

## Current implementation

- `desktop/src/actions/agent_conversation_persistence.js` hardcodes `.md2-agent-logs` below repository root.
- `desktop/src/actions/action_files.js` puts `.md2-action-history` below configured actions folder.
- `app/src/services/agent_conversation_service.ts` discovers conversations only below `.md2-agent-logs/`.
- `app/src/data/file_tree.ts` builds folder nodes from repository files. Current `specialFolderPaths` mark folders as special but still display them; that behavior does not satisfy hidden `logs`.
- `app/src/components/text_view/text_view.tsx` supplies visible special-folder paths but has no hidden system-folder exclusion.

## Fix direction

- Introduce one project-log-folder path rule shared by conversation persistence and action-history persistence.
- Supply resolved `projectFolder` to desktop persistence boundaries instead of deriving log placement from `actionsFolder` or repository root.
- Update conversation discovery and card references to the new repository-relative path.
- Exclude the resolved `logs` folder and all descendants when building list-view tree nodes. Do not merely assign `kind: 'special'`.
- Update worktree-aware reads and writes so logs stay inside the execution worktree's project folder.
- Do not add legacy-path fallbacks without an explicit migration decision.

## Compatibility decision required

Existing projects may contain `.md2-agent-logs`, action-folder `.md2-action-history`, and card headers referencing old conversation paths. Before implementation, decide whether existing files and references are migrated or only new writes use `logs`. This report does not authorize silent duplication or permanent fallback reads from both layouts.

## Acceptance criteria

- New agent conversation and action-history files are written only below `<projectFolder>/logs/`.
- No new `.md2-agent-logs` or action-folder `.md2-action-history` directory is created.
- Card conversation references point to the new repository-relative log path and reopen correctly.
- Action run history loads from the new folder.
- Every new log filename follows the defined underscore-only format and contains no period except `.json`.
- Conversation filenames retain the complete normalized conversation id; history filenames use the normalized unique action id without an added hash.
- Action definitions whose ids collide after filename normalization fail validation with a clear error.
- `logs` and its contents never appear in list-view file tree.
- Other special folders retain current visibility and behavior.
- Empty and nested `projectFolder` configurations resolve correctly.
- Primary-project and worktree executions write and read logs from their own resolved project folder.

## Test plan

- Desktop tests cover conversation and action-history paths for empty and nested `projectFolder` values, plus worktree roots.
- Filename tests cover card and project scopes, source-extension removal, UUID normalization, builtin action ids, and normalized action-id collision rejection.
- React service tests cover conversation discovery and loading through new paths.
- File-tree tests prove `logs` and descendants are excluded while other special folders remain visible.
- Integration tests prove a completed agent action writes both records under `logs`, links the conversation, and reloads conversation and run history.
- Run `npm run lint-fix`, `npm run lint`, and `npm run test` in `app/` and `desktop/`; run `npm run typecheck` in `app/`.

## See also

- `design/feature_descriptions/ready/F_012_agents.md`
- `design/feature_descriptions/ready/F_013_desktop_app.md`
- `design/feature_descriptions/ready/F_050_one_shot_agent_conversations.md`
- `design/architecture/initial description/agents.md`
