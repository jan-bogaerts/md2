# md²

md² is an open-source Kanban-style tracker for software development that is built around plain markdown files instead of a database, and treats AI coding agents as first-class citizens of the workflow — not an afterthought bolted onto a card.

Every piece of work — a feature, a bug, a job — is a single markdown file with a small structured header (id, status, owner, affected files, ...) and a body written in normal prose. Nothing is hidden in a proprietary format: the "database" is just a folder of `.md` files in a git repository, so it can be read, diffed, grepped, and edited with any tool you already use, and it works equally well as a home for human notes or as context an agent can read and write directly.

## Why cards, why markdown

- **The board is the repo.** Cards live in a working folder inside your project's GitHub repository (or, when paired with the desktop app, a local git checkout). A card's `status` field determines which column it appears in — move a card between columns and its file is updated (and committed) accordingly.
- **No lock-in.** Because everything is markdown with a light front-matter header, a project's history is legible without md² at all. Renaming, templating, and searching all just operate on files.
- **Agents read and write the same files you do.** A card's body is the brief an agent works from, and an agent's output — logs, generated diffs, follow-up questions — is linked back to that same card, so a human and an agent are always looking at the same source of truth.

## How it works

- **Two views on the same data:** a **card view** (kanban columns driven by card `status`, drag-and-drop reordering, inline title editing, policy indicators) and a **text view** (a folder tree next to a tabbed markdown editor), so you can work at the level of the whole board or dive into a single file.
- **Actions** are the operations you can run against a card — anything from "implement this feature" (dispatched to an AI agent as a configurable prompt) to a lint/test script or an arbitrary shell command. Actions can chain (`before`/`after` steps), branch on their own output via regex conditions, and fire automatically on state changes (e.g. dragging a card into "in progress" kicks off an "implement" action).
- **Agent-aware by design.** When run inside its companion Electron desktop app, md² can launch coding-agent CLIs directly, stream their stdin/stdout/stderr into logs attached to the card, and let you continue an existing agent conversation with a single click — from the card, or from a split view in the editor.
- **Data layer with two backends.** In the browser, md² talks to GitHub's API directly (sign in with GitHub, work against any repo/branch). Paired with the desktop app, it additionally gets direct local git and filesystem access, so agent actions and file edits can happen without a network round-trip.
- **Everything else is configurable:** card types and ID schemes, markdown style presets, the color theme (light/dark, round-cornered, borderless "flat" look), and the set of available actions are all driven by project configuration rather than hardcoded.

md² is still an evolving concept — see [design/architecture/initial description](design/architecture/initial%20description) for the original design notes this project is built from.

## Development

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
