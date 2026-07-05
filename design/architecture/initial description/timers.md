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

- React app sends schedule instructions to Electron + saves schedule in JSON in repository
  - Perhaps Electron only needs to watch for changes to the schedule file.