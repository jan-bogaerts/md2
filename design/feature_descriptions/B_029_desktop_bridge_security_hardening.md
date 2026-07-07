---
id: B-029
title: desktop bridge still grants arbitrary shell execution to the loaded web app
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Problem
B-015 enabled `contextIsolation`, but the fix is superficial with respect to the threat it described. The Electron window loads a **configurable, remotely deployed URL** (J-001), and the preload bridge exposes to that page:

- `md2Actions.runCommand(command)` — executes an arbitrary shell string in the project root (`local_git_service.runCommand`);
- `md2Data.startAgentConversation` / `md2Actions.runAgent` — spawn arbitrary configured commands with attacker-controllable prompts;
- the full filesystem/git surface of `md2Data`.

Any compromise of the deployed site (or of a dependency it ships, or a misconfigured `MD2_APP_URL`) is still full remote code execution — the exact scenario B-015 called out. `sandbox: false` also keeps the renderer unsandboxed because preload itself needs Node (it spawns processes and touches the filesystem directly).

Related: the remote-control WebSocket passes its auth token as a URL query parameter (`desktop/remote_control_service.js` `isAuthorized`), which leaks into proxy/access logs if the server is ever bound beyond loopback.

## Fix
Layered, in order of value:

1. **Origin gate in preload.** Before calling any `contextBridge.exposeInMainWorld`, check `window.location.origin` against an allow-list from desktop config (default: the origin of the configured app URL). A non-matching origin gets no privileged bridges at all.
2. **Stop accepting raw command strings from the renderer.** The desktop side can read action definitions itself: change the bridge so the renderer passes `{ actionName, context, extraInput }` and the desktop resolves the command text and placeholders from the actions folder on disk. `runCommand(rawString)` becomes an internal function; if a raw escape hatch is kept, gate it behind an explicit desktop-config opt-in (default off).
3. **Move Node work out of preload so it can be sandboxed.** Relocate `local_git_service`, `agent_runner_service`, scheduler and diff execution into the main process behind `ipcMain.handle`; preload shrinks to thin `ipcRenderer.invoke` wrappers and `sandbox: true` becomes possible. (The main process already instantiates these services for remote control — consolidate on that instance instead of the parallel preload-owned set.)
4. **Remote-control token transport.** Accept the token via `Sec-WebSocket-Protocol` or a first authentication message instead of the query string; keep rejecting unauthenticated upgrades.

## acceptance criteria
- Loading any page whose origin is not allow-listed yields a window without `md2Data`/`md2Actions`/`md2Config` and a visible warning.
- A compromised renderer cannot execute a shell string of its choosing: command actions run only from definitions present in the project's actions folder.
- The window runs with `sandbox: true` and preload contains no direct `child_process`/`fs` usage.
- Remote-control clients authenticate without the token appearing in the URL; connections without the token are still rejected.
- Tests cover the origin gate, action-name-based command resolution (unknown name rejected), and the new token handshake.

## see also
- `design\feature_descriptions\B_015_electron_context_isolation.md`
- `design\feature_descriptions\F_032_remote_control_bridge.md`
- `design\architecture\initial description\desktop app.md`
