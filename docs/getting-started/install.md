# Install

## Windows

md² ships as a signed Windows x64 installer, `MD2-Setup-<version>-x64.exe`. Run it and you are done; installing over an earlier version keeps your desktop settings.

## Other platforms

There is no prebuilt macOS or Linux package yet. Run from source instead — see [Development setup](../contributing/development-setup.md). The same command starts the Electron shell on any platform Node and Electron support.

## What you need for real work

md² starts the tools you already have. Install the ones you want to use:

| Tool | Needed for |
| --- | --- |
| [Git](https://git-scm.com/) | Everything. Projects are Git repositories. |
| Codex CLI (`codex`) | Agent actions with the `codex` profile. |
| Claude Code (`claude`) | Agent actions with the `claude` profile. |

Both agent CLIs must be on your PATH and signed in. md² checks for them at startup and disables what it cannot find; it never calls a model API directly, so no API keys are configured in md².

Neither agent is required to use md² as a Markdown-backed board.

## Building the installer yourself

```powershell
npm run install:all
npm run build:windows
```

Artifacts land in `release/`. Signing requires certificate configuration; see [`desktop/packaging/BUILDING_WINDOWS.md`](https://github.com/jan-bogaerts/md2/blob/main/desktop/packaging/BUILDING_WINDOWS.md).

Next: [Open your first project](first-project.md).
