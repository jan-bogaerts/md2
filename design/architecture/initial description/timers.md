# Timers

- Actions can be scheduled to run at a later time
  - at a specific time
  - When agent's next time slot starts -> either API call, agent cmd command or internally calculated
  - When another action is ready

- on the action popup, "Schedule" button, in front of the Run button

- Scheduler runs on the desktop app
  - When project is loaded
    - check if there are any scheduled actions; if so, start running the timer
  - When front-end registers a new schedule, add to timer

- React sends the action `id`, context, and trigger to Electron and saves the schedule in JSON in the repository.
- When a schedule fires, the scheduler delegates to the same Electron-side action runner as a manual run; it never implements a second action-chain runner.
- Schedule state is separate from action execution state.
- Electron watches the schedule file for changes so schedule persistence and timer registration have one source of truth.
