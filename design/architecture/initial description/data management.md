# Data management

- Works on GitHub repositories and when connected to the local electron app, also local file system and local git commands

- actions:
  - create new:
    - use must select repository + branch
    - system adds template files to repository
    - shows created content
  - open:
    - select repository + branch
    - load content from "design" folder (configurable)
      - if not found, ask user which folder to use
      - if no folder, create new content from template
  - allow switch branch from menu

  - add card
    - create new markdown file and commit (1 push) to GitHub
- user can configure if auto push or manual push. When manual, extra button on menu to push changes.
- upon app start: auto-load last project
- when loading project, and when new files are found during usage (retrieved from GitHub), check if any don't follow the naming conventions these are presumed to be new, entered by external app, so import as new features.
  - header is optional.
- naming convention: `{id}-{title}.md`

- id is configurable, per card type (card types are also configurable), default: 
  - feature: `F-{number}`
  - job: `J-{number}`
  - bug: `B-{number}`
- where `number` in the next available number compared to any .md file in the folder (and sub folders)
- subfolders are used to store cards of previous versions

- when a project is loaded, the headers of all the files in the root folder (so the currently active cards) are read to populate the cards and tree.
- the headers of the md files in the sub folders are read after the root is loaded and into the background. Their data can be used for searches.

- when editing the content of a file, auto-save.
  - Use a delay so that only every 30 sec changes are committed 
  - upon close, force commit.

---

- app supports special folders:

  - history folder
    - contains a folder per release
    - md files are moved to a sub folder in the history folder when a release is done. 
  - architecture
    - md files containing generic descriptions (like this file)
  - prompts → also special folder
    - all the actions that can be executed on md files
    - md file has header that configures the action:
      - name
      - when allowed
      - ...
    alteratively, prompts or actions are stored in json files. perhaps both can be used: actions are json definitions that reference prompt files.

---

- data service should be implemented in 2 layers:
  - data service = generic functions

    - like: `saveFile`, `openProject`, ...
    - divided in subservices, depending on scope, e.g.:
      - file
      - project
      - ...
  - storage services = data-storage specific classes, like:
    - GitHub = uses `web api`
    - Git = only available when linked with Electron app
    - other types, web services...

-- 
- Electron app monitors changes in the folders.
  - When files get added / removed / changed, related actions get added / deleted / updated.