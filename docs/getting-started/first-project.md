# Open your first project

A project is a Git repository with a folder md² manages. Any repository works — an existing codebase is the normal case.

## Desktop app

1. Menu → **Open project**.
2. Pick a folder that contains a `.git` directory.
3. If md² finds no project folder, it offers to create one. Accept the default (`design`) or type another name.
4. If the project folder exists but has no working folder, md² asks which folder holds your cards, or creates one.

md² then creates what it needs and loads the board. A spinner and the project name in the app bar show progress; large histories load in the background.

The last project reopens automatically next time you start.

## Web, against GitHub

1. Click the GitHub button in the upper right and follow the link to create a personal access token with repository access, then paste it in.
2. Menu → **Open project**, source **GitHub**.
3. Pick the repository from the list, or type owner and repository and press **Load branches**.
4. Choose a branch and press **Open**.

Cards can be created and edited; actions and agents are not available in this mode. See [Storage modes](../concepts/storage-modes.md).

## Web, against a running desktop app

Source **Remote**, then endpoint, token, project root path, and branch. Easier: scan the QR code from the desktop app — see [Remote control](../guide/remote-control.md).

## What gets created

```text
design/            <- project folder
  active/          <- working folder, your cards
  actions/         <- action definitions
  history/         <- completed releases
  archived/        <- archived cards
md2.config.json    <- project configuration
```

Names are the defaults and all configurable. Everything is committed to your repository like any other file.

## Switching branch

Menu → branch selector. The project reloads on the chosen branch, so cards follow the branch they were committed on.

Next: [Your first card](your-first-card.md).
