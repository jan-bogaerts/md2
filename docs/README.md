# md² documentation

md² is a local, Git-native workspace for coordinating coding agents, features, worktrees, prompts, commits, and automations. 
Every card is a Markdown file, every action and log a json file, all in your repository — agents read and write the same files you do.

Know what AI-assisted work costs by agent, action, feature, and release. Stats connects project activity with measured time, tokens, tool calls, account usage, and estimated subscription cost, with filtered CSV export for further analysis.

![md² board with a card and the action popup open](screenshots/Screenshot%202026-07-23%20180206.jpg)

## Getting started

| Page | What it covers |
| --- | --- |
| [Install](getting-started/install.md) | Windows installer, running from source, which agent CLIs to have |
| [Open your first project](getting-started/first-project.md) | Local folder, GitHub repository, or a remote desktop app |
| [Your first card](getting-started/your-first-card.md) | Create a card, add an action, run an agent on it |

## Concepts

| Page | What it covers |
| --- | --- |
| [Cards and files](concepts/cards-and-files.md) | Header fields, file names, card types, ordering |
| [Project layout](concepts/project-layout.md) | Project, working, actions, releases, archive, activity folders |
| [Storage modes](concepts/storage-modes.md) | Desktop, remote control, GitHub — and what each can do |
| [Actions and agents](concepts/actions-and-agents.md) | Why actions exist, one-shot versus streaming, where runs happen |
| [Usage and cost](concepts/usage-and-cost.md) | How time, tokens, account usage, and subscription-cost estimates are calculated |

## Using md²

| Page | What it covers |
| --- | --- |
| [Board view](guide/board-view.md) | Columns, cards, drag and drop, policies, card popup |
| [List view](guide/text-view.md) | Tree, tabs, editors, conversation panel |
| [Stats](guide/stats.md) | Compare activity, agents, models, tokens, account usage, and estimated cost |
| [Search](guide/search.md) | Text and RegExp search, scopes, results |
| [Git and commits](guide/git-and-commits.md) | Auto-save, commit, push, pull, per-card commit diffs |
| [Worktrees](guide/worktrees.md) | Register worktrees, assign to cards, commit and integrate |
| [Remote control](guide/remote-control.md) | Drive the desktop app from a phone, and its security limits |
| [Configuration](guide/configuration.md) | Every setting, and where it is stored |

## Actions reference

| Page | What it covers |
| --- | --- |
| [Action definition](actions/action-definition.md) | Every field, `appliesTo` filters, validation rules |
| [Placeholders](actions/placeholders.md) | {% raw %}`{{card-file}}`, `{{card-prompt}}`, `{{card-title}}`, `{{worktree-folder}}`, `{{repository-folder}}`, `{{project-folder}}`, `{{releases-folder}}`{% endraw %} |
| [Running actions](actions/running-actions.md) | Entry points, popup, conversations, chains, state triggers, scheduling |
| [Agent setup](actions/agent-setup.md) | Profiles, models, reasoning levels, conversation logs |
| [Cookbook](actions/cookbook.md) | Copy-paste action definitions |

## Contributing

| Page | What it covers |
| --- | --- |
| [Development setup](contributing/development-setup.md) | Repo layout, install, run, test, package |
| [Architecture](contributing/architecture.md) | Layers, storage services, the renderer-never-executes rule |
| [Release process](contributing/release-process.md) | Completing a release, release notes, shipping a build |

## Help

- [Troubleshooting](troubleshooting.md) — disabled run buttons, Stats data, Git locks, worktree errors, and remote connections.
