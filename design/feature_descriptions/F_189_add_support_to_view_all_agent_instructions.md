---
author: 
id: F_189
internalId: 3a0d1119-4bc6-4bba-b47d-ddfabe12d56d
title: add support to view all agent instructions
status: design
owner: 
affects:
agents:
policy:
after: 67d4a581-6ded-4a41-a489-d079644e3e5b
---
when loading the project, we should also search for markdown files that contain agent instructions:

* root readme.md
* all agents.md, every folder that contains this file can be presumed to be a project, so if that folder also contains a readme.md, that can also be loaded
* copilot instructions
* claude specific files
* any other?

These should be placed in a special folder like ´active´ or ´releases´

For name, just show full path as string, so dont put these files in sub folders, they are all in the same special folder, called ´agent instructions´