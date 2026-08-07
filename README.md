# md²

**Plan, run, and track AI coding work feature by feature—with local Markdown cards and Git worktrees.**

> **Download:** [Get the latest Windows x64 installer](https://github.com/jan-bogaerts/md2/releases/latest) · [Installation guide](https://jan-bogaerts.github.io/md2/getting-started/install/)
>
> **Platforms:** md² is an Electron desktop app. Windows x64 has a signed installer; macOS and Linux can run from source, but do not have prebuilt packages yet.

https://github.com/user-attachments/assets/8d9b4f55-6d97-42ff-bba4-ef36c5a64513


## The feature card is the center

In a traditional coding workflow, the source code is the center: you open a project and instruct an AI agent to change it. md² shifts the focus to the work being requested—a feature description, bug report, or job. Source-code changes remain the output, but they are no longer the organizing center.

Each request is stored as a Markdown card in your repository. Everything related to the work hangs off that card:

- its Git worktree
- the coding agent working on it
- chat history
- commits
- design notes and documentation
- token usage and cost

Reusable prompts and actions live at project level. They support the cards: run an action from a card and md² supplies that card's description and worktree context.

The card becomes the shared context for both you and your agents. Instead of reconstructing the work and its history from editor windows, folders, and disconnected conversations, you can follow and manage it from one place. Because cards are ordinary local Markdown files, agents can read and update the same project knowledge directly.

## Works with

- [Codex CLI](https://github.com/openai/codex)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

md² starts the CLIs already installed and authenticated on your machine. It does not call model APIs directly, and either CLI is optional when using md² as a Markdown-backed project board.

## Without and with md²

| Without md² | With md² |
| --- | --- |
| Agent conversations grouped by chat | Activity grouped by feature |
| Worktrees identified by folders/windows | Worktrees assigned to cards |
| Repeated prompts scattered around | Reusable project actions |
| Token use largely invisible | Cost tracked by action and feature |

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

### Run agents from a feature

![A Codex action conversation alongside active feature cards and worktree controls](screenshots/set2/Screenshot%202026-08-01%20194835.jpg)

*Run reusable actions from a card, follow the agent conversation, and commit or integrate the assigned worktree without losing the feature context.*

### Keep the specification beside the work

![A feature card open in the Markdown editor while its agent is running](screenshots/set2/Screenshot%202026-08-01%20194919.jpg)

*The card remains the shared source of truth for its definition, agent activity, worktree, and resulting changes.*

## Getting started

1. [Download and install the latest Windows release](https://github.com/jan-bogaerts/md2/releases/latest), or follow the [source setup](https://jan-bogaerts.github.io/md2/contributing/development-setup/) on macOS or Linux.
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
