# Project layout

An md² project is a folder inside your Git repository. Everything md² knows lives in files there, so it travels with the repo and is visible to agents and to plain `git` commands.

## Folders

```text
<repo>/
  design/                 <- project folder
    feature_descriptions/ <- working folder: the active cards
    actions/              <- action definitions (*.json)
    releases/             <- one subfolder per completed release
    archived/             <- individually archived cards
    activity/             <- conversation and run logs
    architecture/         <- your own notes; any folder works
  md2.config.json         <- project configuration
```

Every folder name is configurable. The names above are the defaults from [`md2.config.json`](../guide/configuration.md); the built-in fallbacks are `design`, `active`, `actions`, `history`, `archived`.

| Setting | Folder | What it holds |
| --- | --- | --- |
| `projectFolder` | `design` | Root of everything md² manages. Leave empty to use the repository root. |
| `workingFolder` | `active` | Cards currently on the board. Only files in the root of this folder are active cards. |
| `actionsFolder` | `actions` | One JSON file per action definition. |
| `releasesFolder` | `history` | One subfolder per completed release. |
| `archivedFolder` | `archived` | Cards archived one at a time. |

`activity` is not configurable: conversation and run logs are always written to `<projectFolder>/activity`, one JSON file per card plus one for project-level runs.

Any other folder you create is a normal folder with normal Markdown files. Create them from the tree in list view.

## Active versus background cards

- **Active cards** — Markdown files directly in the working folder. They are loaded first, populate the board, and are what you work on.
- **Background cards** — cards in subfolders, releases, and the archive. They are loaded afterwards, in the background, and are available to search.

This split is why a large history does not slow down opening a project.

## Completing a release

**Complete release** (Run tab of the menu) moves every active card into a new subfolder of the releases folder. Images referenced by the moved cards move with them, so relative links keep working.

Cards you want out of the way but not part of a release go to the archived folder instead.

## Configuration file

Project settings are stored as `md2.config.json` in the repository root, so every clone and every worktree of the project shares them. Desktop-only settings (default agent, model, reasoning level, agent profiles) live in the desktop app, not in the repo.

See also: [Configuration](../guide/configuration.md), [Cards and files](cards-and-files.md).
