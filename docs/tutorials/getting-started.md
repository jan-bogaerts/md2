# Tutorial: getting started

From a fresh install to an open project you understand. About fifteen minutes.

## 1. Install

Run the Windows installer, `MD2-Setup-<version>-x64.exe`. On macOS or Linux, run from source instead.

Install the tools md² starts for you: Git, and at least one agent CLI (`codex` or `claude`), signed in and on your PATH. Without an agent CLI md² still works as a Markdown board; agent actions are disabled.

Reference: [Install](../getting-started/install.md).

## 2. First run

The desktop app opens on an empty workspace. At startup md² checks which agent CLIs it can find and disables what is missing. It never calls a model API itself, so there are no API keys to enter.

Check the agent defaults on the **Run** tab of the application menu: default agent, model, and reasoning level. These are desktop settings; they stay on your machine and are not written to the repository.

Reference: [Configuration](../guide/configuration.md), [Agent setup](../actions/agent-setup.md).

## 3. Add a GitHub token (optional)

You only need a token to open a repository through GitHub in the browser, without the desktop app.

1. Click the GitHub button in the app bar.
2. Follow the link to create a personal access token with repository access.
3. Paste the token in.

Reference: [Storage modes](../concepts/storage-modes.md).

## 4. Open a project

1. Menu → **Open project**.
2. Pick a folder that contains a `.git` directory. An existing codebase is the normal case.
3. If there is no project folder yet, accept the offered default or type another name.
4. If there is no working folder yet, choose the folder that holds your cards, or let md² create one.

The board loads. Large histories keep loading in the background. Next time, the last project reopens automatically.

Reference: [Open your first project](../getting-started/first-project.md).

## 5. Learn the special folders

md² keeps everything in ordinary files inside your repository:

```text
<repo>/
  <project folder>/
    <working folder>/   <- active cards: the board
    actions/            <- action definitions (*.json)
    diagrams/           <- saved diagrams
    <releases folder>/  <- one subfolder per completed release
    archived/           <- cards archived one at a time
    activity/           <- conversation and run logs
  md2.config.json       <- project configuration
```

| Folder | Use it for |
| --- | --- |
| Working | Cards you are working on. Only files directly in this folder are on the board. |
| Actions | Reusable prompts and commands. Edit them in the action editor, not as raw JSON. |
| Releases | Filled by **Complete release**, which moves every active card into a new subfolder. |
| Archive | Cards you want out of the way without releasing them. |
| Activity | Written by md². Agent conversations and run logs, referenced from the cards. |

Any other folder, such as architecture notes, is a normal folder with normal Markdown files. Create them from the tree in list view.

Reference: [Project layout](../concepts/project-layout.md).

## 6. Look at `md2.config.json`

Open `md2.config.json` in the repository root. It holds the project settings: folder names, card types, board columns (`states`), push mode, diff command, and diagram footer. Because it is committed, every clone and every worktree shares it.

Change these settings through the config dialog (gear button, section **Project**); **Save** writes them to the file.

Reference: [Configuration](../guide/configuration.md).

## Next

[Working with cards](working-with-cards.md).
