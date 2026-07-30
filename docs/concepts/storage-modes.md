# Storage modes

md² is one React app that can talk to three different backends. Which one you get depends on how you started it.

| Mode | Backend | Where files live | Can run actions |
| --- | --- | --- | --- |
| **Desktop** | Electron shell, local `git` | Your disk | Yes |
| **Remote control** | Browser connected to a running desktop app | The desktop machine's disk | Yes, on the desktop machine |
| **GitHub** | GitHub REST API | A GitHub repository | No |

## Desktop

The normal way to use md². The Electron app hosts the React UI and exposes a bridge to the file system and to `git`. Opening a project means picking a folder that contains a `.git` directory.

Everything works here: local commits, worktrees, agents, command actions, scheduled actions, folder watching.

## Remote control

The desktop app can start a small server on your LAN. Another device — typically a phone or tablet — opens the URL, gets the app served from the same port, and connects back over a WebSocket.

The remote browser is a full client: it reads and writes the desktop machine's files and can run actions there. See [Remote control](../guide/remote-control.md) for the connection flow and its security limits.

You can also connect manually from any md² web instance: **Open project**, source **Remote**, then endpoint, token, project root path, and branch.

## GitHub

With no desktop app around, md² runs as a plain website against the GitHub API. Sign in with a personal access token, pick a repository and branch, and edit cards. Commits are pushed through the API.

What you cannot do in this mode:

- run actions or agents (there is no process to run them in);
- use worktrees;
- watch folders for external changes.

Action definitions can still be viewed and edited. Run buttons are disabled with an explanation.

## Switching

The mode is decided when the app starts, not by a setting. Start the Electron app for desktop mode, open the LAN URL for remote-control mode, load the hosted web app for GitHub mode. The project you open must match: a local folder in desktop mode, a repository in GitHub mode.

See also: [Open your first project](../getting-started/first-project.md), [Git and commits](../guide/git-and-commits.md).
