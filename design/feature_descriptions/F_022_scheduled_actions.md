---
id: F-022
title: scheduled actions (timers)
status: ready
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
Allow actions to be scheduled to run at a later time: at a specific time, when the agent's next time slot starts, or when another action is ready. The scheduler runs on the desktop app; React registers schedules and persists them as JSON in the repository.

## Current state
Not implemented. The action popup (`app/src/components/actions/action_popup.tsx`) has a `Run` button but no `Schedule` button. The desktop app (`desktop/main.js`, `desktop/local_git_service.js`) has no timer/scheduler, no schedule file watching and no scheduled-run execution. There is no schedule model or storage format.

## implementation details
- Add a typed schedule model: schedule id, action name, context (file/folder), trigger (`at` timestamp | `agentSlot` | `afterAction` with action name), created timestamp and status (`pending`, `running`, `done`, `cancelled`).
- Persist schedules as a JSON file in the repository (e.g. `{actionsFolder}/.md2-schedules.json`) through the existing storage services so schedules survive restarts and sync with the project.
- Add a `Schedule` button on the action popup, placed in front of the `Run` button. It opens a small trigger picker (time / agent slot / after action) and registers the schedule.
- React sends schedule instructions to Electron through a preload bridge method **and** saves the schedule JSON; alternatively Electron may only watch the schedule file for changes — pick one mechanism and document it (prefer file watching to avoid double bookkeeping).
- Desktop scheduler: when a project is loaded, read pending schedules and start timers; when the schedule file changes, reconcile timers. On fire, run the action through the existing runner path and mark the schedule `done`.
- `agentSlot` triggers may be resolved by API call, agent cmd command or internal calculation; start with a configurable command whose output is a timestamp, and fail clearly when unavailable.
- Surface scheduled runs in the running-agents indicator and action run history like normal runs.

## acceptance criteria
- The action popup shows a `Schedule` button before `Run` for every runnable action.
- A schedule with a specific time fires the action at that time while the desktop app has the project open.
- Schedules are stored as JSON in the repository and restored when the project is reopened.
- Cancelling a pending schedule removes its timer and updates the JSON.
- `afterAction` schedules fire when the named action completes.
- Scheduler failures (invalid schedule file, action no longer exists) are reported as user-visible errors without dropping other schedules.
- Tests cover schedule persistence, timer registration on project load, fire-and-mark-done, cancellation and invalid-schedule handling.

## see also
- `design\architecture\initial description\timers.md`
- `design\architecture\initial description\action_popup.md`
- `design\feature_descriptions\F_010c_command_execution_and_chaining.md`
