# App layout

- **app → entry point**

  - starts services, loads data
  - loads / manages theme (light/dark)
  - shows main window

- **main window**
  - manages global layout (desktop vs mobile)
  - has:
    - main toolbar at top → collapses for mobile (shows hamburger button to open)
    - main body: tree + files or cards
      - desktop shows left + right panel with splitter
      - mobile: left panel content is moved to menu (tree or column names)
      - body → list of cards or editor with tabs at bottom
    - status bar: info, can be edited?
      - only on desktop?
    - keyboard status (caps lock, insert)
    - number of running agents (with list in popup)?

---

- **card:** represents a single markdown file in the project. In normal state shows:
  - title
  - type (feature, job, bug,...)
    - color indicator, vertical line in front of card
      - color is configurable
    - also perhaps as a footnote text on card
  - ID in front of title
  - led indicator for logs / currently running agents/actions?
  - button to open in file mode (to full text editor)

  - **on desktop:**
    - when as card in column, only header info is shown → card is clickable
      - opens dialog with body of markdown
    - on dialog & on context menu of card is button/menu-item to go to file mode; when pressed, switches to tree + file mode with current card opened

  - **on mobile:**
    - when card is pressed, expands (accordion) and shows body of card inline (in card)
      - text is scrollable but text editor toolbar is sticky at top of card
    - button on card allows switching to file viewer → open body of card full screen

  - **File & card body** shows a local toolbar with all the formatting that can be applied to the text (bold, title, ...)

---

- **Tree:** in tree mode, shows the list of folders and markdown files in the project
  - also shows the special folders (like history, architecture, ...)
  - clicking a file opens that file
  - shows a folder for every state
  - in mobile & card mode → only folders are shown if component is on hamburger menu
