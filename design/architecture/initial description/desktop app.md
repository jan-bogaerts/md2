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
    - The accept flow binds to the LAN (`0.0.0.0`), not loopback only, so other devices can reach it; a token is always generated and mandatory for non-loopback binds.
    - Status reports the mDNS hostname endpoint (`ws://<hostname>.local:<port>`) plus IPv4 LAN address fallbacks; the connect-info popover offers copy-to-clipboard and a QR code of the self-contained connect URL (`http://<host>:<port>/#<token>`).

- The Electron app owns the action runner for command and agent actions.
  - The renderer requests execution by action `id`, context, and run-specific input.
  - Electron reloads and validates the persisted definition, resolves linked action ids and placeholders, and executes the complete `onBefore`/main/`on`/`onAfter` chain.
  - `stdin`, `stderr`, and `stdout` are read; text is stored in logs, and agent logs are linked to the card.
  - React receives execution and output events for display.
  - Live conversation input is sent to the active agent through `stdin`.
  - Cancellation stops the active Electron process and chain.
