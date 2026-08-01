---
author: 
id: F_98
internalId: ff356504-eed4-47f3-bb38-2c749b6fcba6
title: worktree vs project folder placeholders
status: ready
owner: 
affects:
agents:
policy:
after: 
---
We have 'rootProjectFolder' placeholder. this currently maps to the folder that the agent is running on, so it could the the main project folder or a worktree.&#x20;

We need to improve this and split it up in `worktree-folder` and 'project-folder' where the last one always references the main project folder while 'worktree-folder' references the folder that the agent is currently running in.

Also, we need to add the 'releases-folder' as well

## Current state

- `{{rootProjectFolder}}` exists in action prompt/command and diff-command placeholder sets.
- Action execution resolves it to the execution checkout, which may be the opened project folder or a linked worktree. Diff commands resolve it to the opened project folder.
- Action editor insertion controls and user documentation expose only the existing placeholder.

## implementation details

- Replace `{{rootProjectFolder}}` everywhere with `{{worktree-folder}}` and `{{project-folder}}`; do not keep a legacy alias.
- `{{worktree-folder}}` resolves to the absolute execution checkout path. When no linked worktree is selected, it equals `{{project-folder}}`.
- `{{project-folder}}` always resolves to the absolute opened repository path, including during linked-worktree execution.
- Add `{{releases-folder}}`, resolving to the configured repository-relative releases path: `<projectFolder>/<releasesFolder>`.
- Support all three placeholders in action prompts, action commands, prompt preparation, diff commands, editor insertion controls, validation, and documentation.
- Fail before process start when a required placeholder value is unavailable. Add tests for primary and linked-worktree execution, custom release paths, diff commands, insertion controls, and removed `{{rootProjectFolder}}` support.

## acceptance criteria

- Primary-checkout actions resolve `{{worktree-folder}}` and `{{project-folder}}` to the opened repository path.
- Linked-worktree actions resolve `{{worktree-folder}}` to that worktree and `{{project-folder}}` to the opened repository path.
- `{{releases-folder}}` returns the configured path relative to repository root, independent of active checkout.
- Action prompts, action commands, and diff commands use the same three folder placeholders.
- Editors and documentation list the new placeholders and no longer list `{{rootProjectFolder}}`.
- `{{rootProjectFolder}}` is not resolved.
