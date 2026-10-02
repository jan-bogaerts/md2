---
author: 
id: F_389
internalId: 55b36bc4-6580-4a70-ad3d-0f413c2f37f8
title: Prepare tutorials
status: design
owner: 
affects:
agents:
  - design/activity/card__55b36bc4-6580-4a70-ad3d-0f413c2f37f8.json
policy:
after: 11011a61-0393-4aa1-9b89-f52be576aa72
changedFiles:
  - README.md
  - docs/README.md
  - docs/actions/action-definition.md
  - docs/actions/placeholders.md
  - docs/actions/running-actions.md
  - docs/concepts/cards-and-files.md
  - docs/concepts/project-layout.md
  - docs/guide/board-view.md
  - docs/guide/configuration.md
  - docs/guide/worktrees.md
  - docs/tutorials/getting-started.md
  - docs/tutorials/git-worktrees.md
  - docs/tutorials/sequencing-and-scheduling.md
  - docs/tutorials/working-with-cards.md
  - docs/tutorials/working-with-diagrams.md
---
* Getting started: first run, open project, special folders,...
* Working wirh cards. The standard dev process, editor features, actions,..
* Git worktrees: setup, using, merge conflicts
* Sequencing and scheduling cards
* Working with diagrams: rendering from code, creating new, implementing,...

Some of these tutorials might already partially exist.&#x20;

We need to group them and make them easily accessible from main readme

## Overview

### Goal

Add task-oriented tutorials in a new `docs/tutorials/` folder. Each tutorial walks through one workflow end to end and links to the existing reference pages instead of repeating them.

### Existing coverage

* `docs/` is reference material; only `getting-started/your-first-card.md` is a walkthrough.
* Getting started: `getting-started/install.md`, `getting-started/first-project.md`, `getting-started/your-first-card.md`, `concepts/project-layout.md`.
* Cards: `concepts/cards-and-files.md`, `guide/board-view.md`, `guide/text-view.md`, `actions/running-actions.md`.
* Worktrees: `guide/worktrees.md` (registering, assigning, working from the card). Merge conflicts are only covered by a README video.
* Sequencing and scheduling: "Ordering" in `concepts/cards-and-files.md`; "Chains", "State triggers" and "Scheduling" in `actions/running-actions.md`. The `after` dependency is not explained from the user's side.
* Diagrams: `guide/diagrams.md` is short; rendering from code and implementing are not covered.

### Tutorials

1. **Getting started**: install, first run, GitHub token, open a project, special folders (working, actions, releases, archive, activity), `md2.config.json`.
2. **Working with cards**: the standard dev process (create, describe, design, implement, review, release), editor features, running actions, conversations, reviewing results.
3. **Git worktrees**: setup, assigning a worktree to a card, committing, merging back, resolving merge conflicts with an agent.
4. **Sequencing and scheduling cards**: card order, the `after` dependency, chains, state triggers, scheduled actions.
5. **Working with diagrams**: rendering from code, creating a new diagram, editing and reviewing, implementing it by running an agent action on the diagram.

### Grouping and access

* Add a "Tutorials" table to `docs/README.md`, above Concepts.
* Add a "Tutorials" section to the main `README.md`, near Videos and Docs, linking each tutorial on the docs site.
* Tutorials may link to the existing videos; the videos stay in the main `README.md`.

### Out of scope

* Rewriting the existing reference pages.