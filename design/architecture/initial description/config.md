---
internalId: 8ed620a5-1097-4deb-8bbe-97d959c32b50
---

# Config

- menu item on toolbar
- opens page with all the app's config parameters on it
  - browsable, so `/config` in URL
- page contains list of sections
  - on desktop, a list of tabs to the left that provide quick jumps to a section
    - use # for the section title so the tabs can browse to the location
      -> browser's back button can be used
  - on mobile, the tabs are shown in the toolbar, below the config item
- section title in bold + underlined
- values identified compared to title
  - for bool: switch
  - prefer dropdown when values are known
  - numbers -> number input field
    or slider when fixed and manageable range
  - all values have a short description text
- system has a global config service that provides a simple interface for the UI
- internally, the config service pulls together the values from a number of different sources, depending on the setup (connected or not connected to the desktop app)
  - when not connected: only config settings that are used by the React app
  - + connection configuration
  - when connected, also include desktop-related setup like:
    - which agent to use
    - location/git (`.\` or a folder)
      - other possible commands
- when a value is changed, no autosave, but show button to save or cancel
- project-related config settings
  - have defaults + values stored in project config files
  - defaults are stored in desktop app
  - examples:
    - card types, roles, ...
- list is only prepared when config is shown and data applied when saved
- when config closes -> list is cleared