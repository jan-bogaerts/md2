---
author: 
id: F_108
internalId: 5cdae748-9597-4d29-8dc0-3d4b5df3aa7f
title: add file-search editor plugin
status: new
owner: 
affects:
agents:
policy:
after: a529defa-f2ad-4307-923b-856a8ce80243
---

The markdown editor currently already has support for the `placeholder plugin (place holder type ahead pluging)` which shows an overlay container when the user enters '{{'

We should add similar support for '@' which should show a popup that shows a list of filenames in the project. As the user types characters after the @, the search list should be further refined.

if the user clicks on a filename or presses enter, the filename should be selected and inserted in the markdown editor as a file link