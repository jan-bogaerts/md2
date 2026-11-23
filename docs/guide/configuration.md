# Configuration

Open configuration with the gear button in the application menu. It opens as a dialog over your workspace, so nothing you had open is lost. Sections are listed on the left (in the toolbar on mobile).

Changes are not saved as you type: **Save** applies them, **Cancel** drops them.

Where values live:

- **Project** settings are stored in `md2.config.json` in the repository root — shared by every clone and worktree.
- **React app** and **Markdown** settings are local to the browser or app instance.
- **Desktop** settings are stored by the desktop app.

## React app

| Key | Default | Meaning |
| --- | --- | --- |
| `react.showStartupSplash` | `true` | Show the splash while the last project is restored. |
| `react.autoCommitDelayMs` | `30000` | Delay after typing stops before changes are committed. Slider, 1 s – 120 s. |

## Project

| Key | Default | Meaning |
| --- | --- | --- |
| `project.projectFolder` | `design` | Root folder md² manages. Empty means the repository root. |
| `project.workingFolder` | `active` | Folder holding the active cards. |
| `project.actionsFolder` | `actions` | Action definition files. |
| `project.diagramsFolder` | `diagrams` | JSON diagram files inside the project folder. |
| `project.releasesFolder` | `history` | One subfolder per completed release. |
| `project.archivedFolder` | `archived` | Individually archived cards. |
| `project.backgroundShade` | `neutral` | Background tint, to tell instances of different projects apart. |
| `project.diffCommand` | {% raw %}`git show {{commit}}`{% endraw %} | Command used to render a commit diff. Placeholders: {% raw %}`{{worktree-folder}}`, `{{repository-folder}}`, `{{project-folder}}`, `{{releases-folder}}`, `{{actions-folder}}`, `{{commit}}`, `{{branch}}`, `{{file}}`{% endraw %}. |
| `project.diagramFooter` | Built-in diagram JSON instructions | Markdown appended to diagram agent prompts. Must include {% raw %}`{{diagram-file}}`{% endraw %}. |
| `project.pushMode` | `auto` | `auto` pushes commits immediately; `manual` waits for the **Push** button. |
| `project.cardBodyTemplate` | Goal / Current status / Details / Tasks | Markdown inserted into new cards. |
| `project.cardSeparator` | `_` | Separator in generated card file names (`_` or `-`). Existing files keep theirs. |
| `project.cardTypes` | feature / job / bug | Card types: `type`, `label`, `idPrefix`, `color`. |
| `project.states` | new … ready | Board columns in display order: `state`, `alwaysVisible`, `color`, optional `defaultActionId`. The default action is preselected when the action popup opens for a card in that column. |

Linked worktrees are managed from this section too — see [Worktrees](worktrees.md).

## Desktop

| Key | Default | Meaning |
| --- | --- | --- |
| `desktop.agentSelection` | built-in defaults | Active agent plus remembered account, model, reasoning, speed, and permission settings for each agent. Use the **Run** tab rather than editing the JSON directly. |
| `desktop.agentAccounts` | Initial Codex and Claude accounts | Account metadata. Manage it through **Agent accounts** in the configuration dialog; additional accounts use separate provider configuration folders. |
| `desktop.agentTaskTrackingEnabled` | `false` | Let Codex and Claude publish task lists shown in conversations and as progress below a running card's **Run** button. Uses additional context. |
| `desktop.codexSearchEnabled` | `true` | Allow Codex runs to use web search. |
| `desktop.mergeConflictResolverCommand` | *(empty)* | Command that opens a conflicted file in an external merge tool. Requires {% raw %}`{{file}}`{% endraw %}; {% raw %}`{{repository-folder}}`{% endraw %} is optional. Empty disables the **External resolver** button. See [Worktrees](worktrees.md#merge-conflicts). |
| `desktop.agentProfiles` | built-ins | Agent profile definitions, including optional monthly subscription cost for Stats estimates. See [Agent setup](../actions/agent-setup.md). |

Agent, account, model, and reasoning level can be set straight from the **Run** tab of the menu. See [Agent setup](../actions/agent-setup.md) for account management and override precedence.

## Markdown

Choose a predefined Markdown style, or adjust font, size, weight, and color per section (title levels, body, captions, code). Editing a predefined style turns it into a custom style; switching back to a preset asks before discarding your changes. A live preview shows the result.

## Theme

Light and dark mode toggle from the title bar. The desktop app reads the theme before creating its window, so the window buttons match from the first frame.

See also: [Project layout](../concepts/project-layout.md), [Diagrams](diagrams.md), [Stats](stats.md), [How usage and cost are calculated](../concepts/usage-and-cost.md).
