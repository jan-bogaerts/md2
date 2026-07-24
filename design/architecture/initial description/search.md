---
internalId: 2d872649-3c84-4e94-8054-8f5c0fdc945c
---

# Search

- The app should have an easy to access search. Perhaps at the top of the window.
  - The window is rendered borderless
    - so that there is no top window bar with title that can be dragged
    - so the drag bar must be implemented manually with CSS
    - so we need to watch out where to put the search input while still having drag functionality and working input

- Search does a text search (something like `contains()`) on all the cards (full content) and on all history (not loaded because not loaded)

- Option to turn on RegExp search
  - with option to ask agent to build RegExp

- Search results are split into:
  - current cards at top
  - stuff found in special folders (like history or architecture) below the main results, with title of special folder name

- When click on search result
  - go to card or file (keep current view)
- Option to turn on full search (in body) in history and all other special folders
- For architecture: also only search in header info by default
  - can include description

- Perhaps also option to search in actions