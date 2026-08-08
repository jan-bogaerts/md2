---
internalId: 3373bf52-14c0-4cc7-8f7c-555c835af9a0
id: F_119
status: ready
title: add merge conflict resolver support
after: 0ef8b9a6-ac40-4617-b077-17260b17a61c
agents:
  - design/activity/card__3373bf52-14c0-4cc7-8f7c-555c835af9a0.json#conversation=agent-dd3c8056-cd7b-4a3a-bbf8-c0276e0093a6
  - design/activity/card__3373bf52-14c0-4cc7-8f7c-555c835af9a0.json#conversation=agent-de1178a8-f7b3-4ad6-8982-12422ff6d844
  - design/activity/card__3373bf52-14c0-4cc7-8f7c-555c835af9a0.json#conversation=agent-c7edd314-1a45-42b4-b34f-5c4a78553902
branch: f_119_add_merge_conflict_resolver_support
---
* in config allow user to specify which external merge-conflict resolver tool to use.
* upon merge conflict: show dialog where user can go over every file that has issues. for every file, he can open the external tool or use an agent to solve it.
* user can also use an agent to resolve all merge conflicts
* if external tool is used, after close of external tool, user must flag the file as resolved manually.
* For the agent, it should be possible to assign an action to the ´resolve merge conflict type. Actions already have a filtering mechanisme, extend this.