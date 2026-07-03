# MD2

- React website
- Login with GitHub credentials.
- Editor for markdown files.
- Files are stored in a GitHub repo.
- App shows/works with the content of a specific (user-defined) folder in the repo.
- Markdown files are expected to have a specially formatted header at the top:

```text
author: xx
id: X-XXX
internalId: generated UUID. not allowed to be changed, for internal use
status: xx
owner: xx
affects:
policy
...
```

- App can create/edit/remove markdown files.
  - Always stored in the user-defined 'working folder'. at the root means currently active.
- When a new file is created, a template can be applied.

Example:

```markdown
# Goal

# Current status

# Details

# Tasks
```

- Special header is automatically added.
- App has different views:
  - Card view: shows files as cards in columns.
    - Columns map to `status`.
    - Show title in card.
    - Policies are shown as leds on the card (upper right corner). Click to toggle.
    - Drag cards from column to column and within a column to change the order.
    - Use the tag 'after' to determine the order. `after` contains the internalId of the card that is in front of the nearest card. This way we only need to change 2 or 3 files when a card is moved.
    - Allow inline edit of title.
- Text view: 2 sections:
  - Left side: tree where the folders are, the "status" values.
  - Right side: tabs with open files.
- `Affects` contain a list of files located in the repo. The user can edit this list easily from a custom dialog.
  - A dropdown is shown with proposed files, filtered on what is already typed.

- when app is running in Electron, allow running shell commands to start an agent.
  - The string that gets sent to the agent is configurable.
  - Another folder in the repo can have another list of markdown files; each file becomes a command that can be executed against the file. The other markdown can contain placeholders like `{{file}}`.
  - Set default agent from menu, or configurable on the action definition or when the action is started.

- All views need to be optimized for desktop and mobile use.

---

Overall, the notes are remarkably clear. The only section I wasn't completely confident about is the paragraph describing how the ordering of cards should be stored after drag-and-drop. If you'd like, I can also convert these notes into a clean requirements specification or a GitHub README/design document.
