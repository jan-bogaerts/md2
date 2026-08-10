---
author: 
id: F_155
internalId: 615b2a1f-55c2-4113-b1ac-589ae3474ae2
title: auto check for newer version
status: new
owner: 
affects:
agents:
  - design/activity/card__615b2a1f-55c2-4113-b1ac-589ae3474ae2.json#conversation=agent-599cc38f-625e-4af4-8f7e-0af7c48619a2
policy:
after: bbf61e6e-adfa-46ee-a2f4-040b8152bc4b
---

The app is released on github in a public repository. this can normally be checked for new vesions.

When the app starts up, we should have a service that checks if there is a new version ready to download. If there is, a snackbar should inform the user that a new version is available, with an 'install' button. when clicked, download starts in the background. show a progress bar on the snackbar for the download. Don't forget to use large buffers so the download is fast (large file).

When downloaded, launch.