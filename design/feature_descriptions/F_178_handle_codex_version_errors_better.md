---
author: 
id: F_178
internalId: 894c324e-d9cf-400f-b964-5256ffff9b24
title: handle codex version errors better
status: new
owner: 
affects:
agents:
policy:
after: 6e978222-1b68-4e43-bcbf-2e1efa4f6147
---

When vscode updated codex plugin, the global log version has changes and the codex cli begins to complain that an update is required.

we need to handle this better. currently, i think it is only shown the first time it is encountered, but as a local error to that action-popup, hidden behind a small icon.

this needs to be improved. use dialog service to show a snackbar. snackbar needs a button to trigger an auto update of the codex cli. this is a command line statement that needs to be run.