---
internalId: f4a16745-6a8d-464b-9ec9-46948280d448
---

# Timers

- Actions can be scheduled to run at a later time
  - the user selects a date and time on the action popup
  - React converts the local selection to an absolute timestamp

- on the action popup, "Schedule" button, in front of the Run button

- Scheduler runs on the desktop app
  - When project is loaded
    - check if there are any scheduled actions; if so, start running the timer
  - When front-end registers a new schedule, add to timer

- React sends the action `id`, context, and timestamp trigger to Electron, which saves the schedule in JSON in the repository.
- When a schedule fires, the scheduler delegates to the same Electron-side action runner as a manual run; it never implements a second action-chain runner.
- Schedule state is separate from action execution state.
- Electron watches the schedule file for changes so schedule persistence and timer registration have one source of truth.
- Timers beyond the platform's maximum delay are re-registered until the selected time is due.
