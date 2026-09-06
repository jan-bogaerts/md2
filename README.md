# md²

**Plan, run, and track AI coding work feature by feature—with local Markdown cards and Git worktrees.**

> **Download:** [Get the latest Windows x64 installer](https://github.com/jan-bogaerts/md2/releases/latest) · [Installation guide](https://jan-bogaerts.github.io/md2/getting-started/install/)
>
> **Platforms:** md² is an Electron desktop app. Windows x64 has a signed installer; macOS and Linux can run from source, but do not have prebuilt packages yet.

https://github.com/user-attachments/assets/260ec55c-2905-47fa-9952-8f07b8c31c13

## Videos

- [Merge an agent's worktree branch](https://github.com/user-attachments/assets/8d9b4f55-6d97-42ff-bba4-ef36c5a64513) — Merge a branch back into the main working branch after an agent finishes implementing a card.
- [Resolve merge conflicts between worktrees](https://github.com/user-attachments/assets/c04324ce-273d-43b7-b739-02c7011cefad) — Let an agent resolve conflicts when multiple worktrees change the same files.
- [Switch agents during a conversation](https://github.com/user-attachments/assets/5078f4b6-3434-44f7-94ea-3b831d998eab) — Assign another agent and automatically migrate the active conversation.
- [Open link in VsCode](https://github.com/user-attachments/assets/05484930-e84f-437e-9baa-a83e8822c97f) - open links to source code files in cards or agent responses


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
| Token use and subscription value largely invisible | Time, tokens, and estimated cost tracked by agent, action, feature, and release |

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

### Measure AI engineering cost and performance

md² connects agent activity to the work that produced it. Compare Claude and Codex by measured time, tokens, tool calls, account usage, and estimated subscription cost:

* see which features and reusable actions consume the most resources;
* compare agent and model performance over time;
* estimate cost per feature, action, or agent;
* review the current release or a completed release; and
* export the filtered chart data as CSV.

This makes it easier to find expensive workflows, compare agent configurations, and understand what AI-assisted delivery costs. Cost figures are subscription-based estimates; account usage can also include other projects and direct CLI sessions.

[Learn how project Stats works](https://jan-bogaerts.github.io/md2/guide/stats/).

md² is still an evolving concept — see [design/architecture/initial description](design/architecture/initial%20description) for the original design notes this project is built from.

## Screenshots

### Run agents from a feature

![A Codex action conversation alongside active feature cards and worktree controls](screenshots/Screenshot%202026-09-06%20145934.jpg)

*Run reusable actions from a card, follow the agent conversation, and commit or integrate the assigned worktree without losing the feature context.*

### Keep the specification beside the work

![A feature card open in the Markdown editor while its agent is running](screenshots/Screenshot%202026-09-06%20150456.jpg)

*The card remains the shared source of truth for its definition, agent activity, worktree, and resulting changes.*

### Configure an agent action

![The list view showing the prompt configuration for an agent action](screenshots/Screenshot%202026-09-06%20150101.jpg)

*Predefine the prompt for an action that will be run by an agent.*

### Review cost per feature

![Release statistics showing the estimated cost per feature](screenshots/Screenshot%202026-09-06%20150204.jpg)

*Use release statistics to compare estimated costs across the features included in the current release.*

### Explore the project diagram

![The experimental project diagram view](screenshots/Screenshot%202026-09-06%20150258.jpg)

*Explore relationships in the new diagram view. This feature is still experimental.*

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
npm install
npm run install:all
```

This first installs the root development dependencies used by the shared workflows, then installs dependencies for both `app` and `desktop`.

### Run

```powershell
npm run dev
```

This starts the Vite dev server for `app` and, once it's up, launches the Electron shell (`desktop`) pointed at it. To run either half on its own: `npm run dev:app` or `npm run dev:desktop`.

### Optional environment variables

`desktop/.env.example` lists the optional `MD2_SENTRY_DSN` and `MD2_APTABASE_APP_KEY` settings used by both the renderer and Electron for error reporting and analytics. Copy it to `desktop/.env` and fill it in if you want telemetry locally — neither setting is required to build or run the app.

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
