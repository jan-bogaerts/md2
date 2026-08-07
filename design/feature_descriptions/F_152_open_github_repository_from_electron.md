---
author: 
id: F_152
internalId: 56f68e51-66b5-4b47-9cf2-6a47128a0cb6
title: open github repository from electron
status: new
owner: 
affects:
agents:
policy:
---
When the react app is running in the electron environment, it defaults to opening projects by selecting a folder.

When the react app is connected through a remote connection (websockets), the app is able to open a repository, but only from the user's own account.

* it should  be possible to open public repositories as read-only
* it should always be possible to open a repository from github.

We need to add an 'open dialog' to support this feature. from this dialog, the user can always choose between personal or public repository, and when running in the electron environment, the user can also select a folder.

To select a folder:

* text input, with button at end of input (use the MUI components for this so the button is inlined) to select the folder with the os dialog.
* below that, a list of previously selected folders. if clicked, this is opened

so app must track last 5 unique folders that were opened