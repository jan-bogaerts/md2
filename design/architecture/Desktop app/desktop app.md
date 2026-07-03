# Desktop app

- Electron based
- Hosts React app
- Provides a bridge to the React app to provide access to the file system
  - The Electron app implements a custom backend data service. Instead of GitHub, it uses Git directly and uses the files on disk.
  - When the React app sees it has a connection with the Electron app, opening a project is done by opening a folder.
    - Should contain `.git`
- Also, the React app has a button on the toolbar to start "remote control".

- Electron app provides 2 types of bridges with the React app:
  - via preload.js → for desktop usage
  - WebSocket: when "remote control" is activated, the Electron app starts a WebSocket server that the React app can connect to.

- The Electron app is responsible for running the agents.
  - `stdin`, `stderr` & `stdout` are read, text is stored in logs, logs are linked to the card (ref to log is stored in card).
  - The React app is sent the output & errors.
  - Input is sent to `stdin`.
