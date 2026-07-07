---
id: J-006
title: split desktop local git service into three modules plus aggregator
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Item 3 of J-002. `desktop/local_git_service.js` is ~694 lines covering git plumbing, project file IO and action/schedule file IO. Split it into three real modules with an aggregator so `preload.js`, `local_bridge_dispatch.js` and `main.js` are untouched. Pure refactor — **no behavior change**.

Depends on: J-003 (pass-through `git_commands.js`/`project_files.js`/`action_files.js` deleted, core renamed back to `local_git_service.js`) — this task recreates those three filenames as genuine modules with the logic moved in.

## implementation details
- `desktop/git_commands.js` — runGit/hasStagedChanges/commitStagedChanges, branch list/checkout, push, assertGitRoot; the path guards (`ensureInsideRoot`, `requireRootPath`) move here and are re-exported where needed.
- `desktop/project_files.js` — load project/root/config, read/write/delete/move files, working-folder template, watchProject.
- `desktop/action_files.js` — action definition loading, schedules load/save/cancel, run-history load/append, agent-conversation log reads.
- `local_git_service.js` remains as the aggregator: `module.exports = { ...gitCommands, ...projectFiles, ...actionFiles }` — bridge contracts and existing requires do not change.
- One module extraction per commit; each commit **moves** the functions out of the aggregator (the first attempt left the logic inline and made the three files re-export lists — that is the failure mode to avoid).
- Run the desktop test suite after each commit; move tests alongside the code they cover where they are function-specific.

## acceptance criteria
- `local_git_service.js` is a thin aggregator (roughly composition only, well under 100 lines); each of the three modules holds its own logic with no duplicates left in the aggregator.
- `preload.js`, `local_bridge_dispatch.js` and `main.js` are unchanged.
- Desktop test suite passes after every commit; lint passes.

## see also
- `design\feature_descriptions\ready\J_002_refactor_large_modules.md`
- `design\feature_descriptions\J_003_refactor_cleanup_dead_files_and_shims.md`
