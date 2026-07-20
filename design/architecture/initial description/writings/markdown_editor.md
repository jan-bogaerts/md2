# MDX Editor optimization

- Action Editor & card Editor
  - wrappers, sub components manage data locally

- Open Files Service
  - raises event when `activeFile` or `files` has changed
  - keeps ref to actual object, not id
  - monitors storage service (and any other services that replace objects) for renewing of objects. So if the backend informs that file of type A with id (or internal id) Y, needs to be replaced with a new object, then it replaces these objects in internal fields and raises events so that UI can refresh.
  - Sub components of the editor monitor events raised by OpenFileService and refresh accordingly.
  - MDX Editor monitors "ActiveFile" event and calls `setMarkdown` to refresh the UI instead of props or state changes.
  - Markdown Editor has prop `dataSource` which is an interface used to get the markdown.
  - Interface implementations:
    - Project card
    - Action Definition
      - Should also raise event when selected tab changes.
      - Markdown Editor registers for this event on `dataSource` when possible and refreshes markdown when possible.


