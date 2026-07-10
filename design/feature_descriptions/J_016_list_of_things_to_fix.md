- status bar:
  - remove input 'status'
  - show total cards loaded, total currently active
- menu-bar is not correctly build (for larger screens). check `C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\main_window\menu` which is the menu of another app. This app should have a similar approach:
  - tabs at the top. after the tabs, the search component, after the search, the drag position. No app name.
  - each tab-bar (C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\main_window\menu\menu_tab_component.jsx) is split up in sections (C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\main_window\menu\menu_section_component.js).
  - use icon buttons and toggles, always with a tooltip(see: `C:\Users\janbo\Documents\dev\vidsy\vidsy_ai_electron\src\main_window\menu\menu_styled.js` note: they put labels on the buttons, this is not needed).
  - tabs:
    - home:
      - Project (section)
        - Open project
        - switch branch (a select)
        - complete release
      - view:
        - toggle: cards / text
      - account:
        - github
    - edit:
      - card:
        - new
        - delete
    - format:
      - all the markdown formattings that can be applied (header1, bold,...)
    - options:
      - setup
        - select for default agent
        - config
      - view:
        - light/dark view







done:
- `remarkable import` is a card. this needs to be a dialog, opened from an action on the toolbar.
- only show config data of the active tab (allow routes to go to tab)
- - there are currently 4 buttons related to search, after it, always visible. they should only become visible when search has focus, and they should be in a dropdown that opens upon focus
- dialog error handling