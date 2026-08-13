---
author: 
id: F_179
internalId: 7082348f-6737-4bef-ab60-2fdbcdf5da4e
title: add support placeholder
status: ready for implementation
owner: 
affects:
agents:
  - design/activity/card__7082348f-6737-4bef-ab60-2fdbcdf5da4e.json#conversation=agent-0c7acf1f-3e2c-45b1-b22c-cb28a68d26d6
  - design/activity/card__7082348f-6737-4bef-ab60-2fdbcdf5da4e.json#conversation=agent-dc17b4ed-082d-4895-8cb0-911848abd7d8
policy:
after: 43bf8521-8caa-4127-88fc-c31454193b90
branch: f_179_add_support_placeholder
worktree: 1
---

we need to add a new placeholder:

* active-cards-folder: absolute path to the folder that contains the cards currently shown on the dashboard.

## Current state

- Active cards are root-level Markdown files in configured `project.workingFolder`; nested files are background cards. That working folder is relative to configured `project.projectFolder` under opened repository.
- Action placeholder resolution supports worktree, repository, project, and releases folders, but not `{{active-cards-folder}}`. Unknown placeholders remain literal.
- Desktop action runner receives project and releases paths, but its project-start flow does not carry configured working folder. Prompt editors, diff commands, and placeholder docs also omit new placeholder.

## implementation details

- Add `{{active-cards-folder}}` to action placeholder catalogs and both placeholder resolvers. Resolve it to absolute `<opened repository>/<project.projectFolder>/<project.workingFolder>` path.
- Keep value rooted in opened repository during linked-worktree runs. `{{worktree-folder}}` alone follows action execution checkout; dashboard continues showing opened project's active cards.
- Load configured working folder when desktop project starts, combine it with configured project folder once, and pass resulting repository-relative path through runner snapshot to prompt preparation, stored or edited agent prompts, command actions, and linked actions.
- Add same placeholder to configured diff-command resolution, using opened repository path and configured project and working folders.
- Fail before process start when placeholder is used without valid working-folder configuration or opened repository root. Keep whitespace-tolerant placeholder syntax and unknown-placeholder pass-through unchanged.
- Update placeholder typeahead, toolbar data, user docs, and tests. Cover shared resolution, runner configuration, agent and command execution, scheduled actions, linked worktrees, diff commands, and missing values.

## acceptance criteria

- With opened repository `C:\repo`, `projectFolder: design`, and `workingFolder: feature_descriptions`, `{{active-cards-folder}}` resolves to `C:\repo\design\feature_descriptions`.
- Empty configured project folder places active cards folder directly under opened repository; established working-folder default still applies when configuration omits that optional field.
- Agent prompt preparation, stored and edited agent prompts, command actions, linked actions, scheduled actions, and configured diff commands resolve same absolute active-cards-folder value.
- Linked-worktree actions keep `{{active-cards-folder}}` rooted in opened repository while `{{worktree-folder}}` resolves to linked checkout.
- Missing required repository or working-folder data fails before process start with clear error. Unknown placeholders remain literal.
- Action-editor typeahead and toolbar insertion list `{{active-cards-folder}}`; documentation defines active cards as root-level Markdown files shown on dashboard.
