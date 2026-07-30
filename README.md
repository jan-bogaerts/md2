# md²

**A local, Git-native workspace for coordinating features, worktrees, coding agents, prompts, commits, and automation.**

AI-assisted development quickly becomes fragmented.

You may have multiple worktrees, ten or more VS Code windows, several agent sessions, repeated prompts, generated scripts, and a long history of commits—without a clear overview of which agent is working on which feature.

md² organises all of that around the work itself.

Each feature, bug, or task is represented by a Markdown card inside your project. That card can be linked to its worktree, agent sessions, actions, commits, design notes, logs, and token usage. Agents can read and update the same local files directly, while you manage the overall workflow from a single dashboard.

## Docs

Full docs: https://jan-bogaerts.github.io/md2/

## Why md²

### One dashboard for agents and worktrees

A card can be linked to the worktree and coding agent working on it. Instead of searching through editor windows and terminals, you can see the state of the entire project in one place.

Agents can update their cards automatically as work progresses.

### Context stays with the feature

A feature often takes multiple prompts, sessions, and commits to complete.

md² links those interactions back to the feature instead of presenting one large, disconnected history of agent conversations.

### Local Markdown as shared project knowledge

Cards, design notes, plans, and other project information are ordinary Markdown files stored inside the repository.

Agents can read and update them directly without requiring access to an external project-management service. The files can also be searched, diffed, versioned, and edited with normal development tools.

### Reusable, controlled actions

Repeated prompts often grow into large collections of instructions or skills. Loading all of them can consume tokens and introduce irrelevant context.

md² lets you create smaller reusable actions for specific tasks. Actions can contain automatically resolved placeholders such as:

`{{card-file}}`

This keeps prompts focused on the current task.

### Automation without unnecessary agent calls

Not every development task requires an AI agent.

Command actions can commit changes, update diagrams, run tests, change card state, or execute scripts at specific points in the workflow.

For recurring complex work, an agent can create a script once and md² can reuse it later without spending tokens on the same reasoning every time.

### Token usage tied to actual work

md² tracks token usage and cost:

* per action
* per feature
* across the complete project

This makes it easier to understand where agent time and tokens are being spent.

md² is still an evolving concept — see [design/architecture/initial description](design/architecture/initial%20description) for the original design notes this project is built from.

## Screenshots

UI early days, more to come.

- [Screenshot](screenshots/Screenshot%202026-07-23%20180206.jpg)
- [Screenshot](screenshots/Screenshot%202026-07-23%20190011.jpg)
- [Screenshot](screenshots/Screenshot%202026-07-23%20190055.jpg)

## Getting started

1. Install the app.
2. Click the GitHub icon, upper left corner, follow link to get a GitHub access token, copy-paste token in.
3. Open project, select a folder that contains a git repository.

## Development setup

The repo has three parts: [app/](app/) (the React/Vite web UI), [desktop/](desktop/) (the Electron host shell), and [shared/](shared/) (types and logic used by both). Each subproject has its own `package.json` and npm scripts, but a root `package.json` wires up the common workflows.

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS) and npm
- Git

### Install

```powershell
npm run install:all
```

This installs dependencies for both `app` and `desktop`.

### Run

```powershell
npm run dev
```

This starts the Vite dev server for `app` and, once it's up, launches the Electron shell (`desktop`) pointed at it. To run either half on its own: `npm run dev:app` or `npm run dev:desktop`.

### Optional environment variables

`app/.env.example` and `desktop/.env.example` list optional Sentry/Aptabase keys for error reporting and analytics. Copy to `.env` and fill in if you want telemetry locally — neither is required to build or run the app.

### Lint & test

Each subproject is standalone and has its own npm scripts.

```powershell
cd app
npm run lint
npm run lint-fix
npm run test
```

```powershell
cd desktop
npm run lint
npm run lint-fix
npm run test
```