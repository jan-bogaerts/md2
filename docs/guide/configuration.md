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
| `project.releasesFolder` | `history` | One subfolder per completed release. |
| `project.archivedFolder` | `archived` | Individually archived cards. |
| `project.backgroundShade` | `neutral` | Background tint, to tell instances of different projects apart. |
| `project.diffCommand` | {% raw %}`git show {{commit}}`{% endraw %} | Command used to render a commit diff. Placeholders: {% raw %}`{{worktree-folder}}`, `{{repository-folder}}`, `{{project-folder}}`, `{{releases-folder}}`, `{{commit}}`, `{{branch}}`, `{{file}}`{% endraw %}. |
| `project.pushMode` | `auto` | `auto` pushes commits immediately; `manual` waits for the **Push** button. |
| `project.cardBodyTemplate` | Goal / Current status / Details / Tasks | Markdown inserted into new cards. |
| `project.cardSeparator` | `_` | Separator in generated card file names (`_` or `-`). Existing files keep theirs. |
| `project.cardTypes` | feature / job / bug | Card types: `type`, `label`, `idPrefix`, `color`. |
| `project.states` | new … ready | Board columns in display order: `state`, `alwaysVisible`, `color`. |

Linked worktrees are managed from this section too — see [Worktrees](worktrees.md).

## Desktop

| Key | Default | Meaning |
| --- | --- | --- |
| `desktop.agent` | `codex` | Default agent profile for actions. |
| `desktop.model` | *(empty)* | Default model; empty uses the profile default. |
| `desktop.thinkingLevel` | `none` | Default reasoning level. |
| `desktop.codexSearchEnabled` | `true` | Allow Codex runs to use web search. |
| `desktop.agentProfiles` | built-ins | Agent profile definitions, including optional monthly subscription cost for Stats estimates. See [Agent setup](../actions/agent-setup.md). |

Agent, model, and reasoning level can also be set straight from the **Run** tab of the menu.

## Markdown

Choose a predefined Markdown style, or adjust font, size, weight, and color per section (title levels, body, captions, code). Editing a predefined style turns it into a custom style; switching back to a preset asks before discarding your changes. A live preview shows the result.

## Theme

Light and dark mode toggle from the title bar. The desktop app reads the theme before creating its window, so the window buttons match from the first frame.

See also: [Project layout](../concepts/project-layout.md), [Stats](stats.md), [How usage and cost are calculated](../concepts/usage-and-cost.md).
