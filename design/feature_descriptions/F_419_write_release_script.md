---
author: 
id: F_419
internalId: c9eb5c09-0c01-490f-808c-143ff534322b
title: write release script
status: ready
owner: 
affects:
agents:
  - design/activity/card__c9eb5c09-0c01-490f-808c-143ff534322b.json
policy:
branch: f_419_write_release_script
worktree: 1
changedFiles:
  - scripts/publish_release.ps1
  - scripts/publish_release.test.ps1
---
write a script that will:

* create a new tag on github with the current release number as can be read in [package.json](desktop/package.json)
* use that tag to create a new release on github.&#x20;
  * use the version as the release title
  * for the release notes, use the release\_notes.md files saved in the latest release folder, a sub folder of  `design\releases`. This folder will have as name, the current release number where the '.' are replaced with '\_'
  * upload the latest build found in `{{repository-folder}}/release`.  filename will be MD2-Setup-{{version}}-x64 where {{version}} is the release version.
* publish that release

## Current state

* Version source: `desktop/package.json` `version` (now `0.8.3`). `scripts/update_version.ps1` sets it in `app/` and `desktop/` `package.json`. `desktop/packaging/BUILDING_WINDOWS.md` names `desktop/package.json` authoritative.
* Build: `npm run build:windows` (`desktop/packaging/build_windows.js`) writes signed installer to `release/MD2-Setup-<version>-x64.exe` at repository root. Name comes from `artifactName` in `desktop/packaging/builder_config.js`. No electron-builder `publish` config exists.
* Release notes: complete-release flow (`app/src/services/release_operations.ts`) moves cards into `design/releases/<release name>`; folder name is release name typed by user. Latest folder `design/releases/0.8.3` uses dots, so script uses version unchanged as folder name (user decision; spec text about `_` is superseded). Older folders use `_` (`0_7_0`); `0.8.0` has no `release_notes.md`.
* `release_notes.md` starts with frontmatter (`---` block holding `internalId`), then `# MD² <version>` and bullets. Frontmatter is md2 metadata, not release text.
* Existing git tags use `V_0_7_1` style. New script uses `v<version>` (user decision), e.g. `v0.8.3`. Old tags untouched.
* No GitHub release tooling in repository: no `.github/workflows`, no release script. `gh` (GitHub CLI) not installed on this machine. Remote `origin` \= [`https://github.com/jan-bogaerts/md2.git`.](https://github.com/jan-bogaerts/md2.git.)
* Script precedent: `scripts/update_version.ps1` (PowerShell 5.1, `$ErrorActionPreference = 'Stop'`, `throw` on invalid input) with plain-PowerShell test `scripts/update_version.test.ps1`.

## Implementation details

New file `scripts/publish_release.ps1`. Runs from any working directory; resolves repository root via `Split-Path -Parent $PSScriptRoot`. No parameters: version always read from `desktop/package.json`.

Prerequisite (document in script header comment): `gh` installed and authenticated (`gh auth login`) with push and release rights on `origin`.

Steps, in order. Every validation runs before first remote change, so failed validation changes nothing on GitHub:

1. Read `desktop/package.json` (UTF-8), parse with `ConvertFrom-Json`, take `version`. Missing or non-string: `throw`.
2. Derive values once: `$tag = "v$version"`, release title \= `$version`, notes path \= `design/releases/$version/release_notes.md`, installer path \= `release/MD2-Setup-$version-x64.exe`.
3. Validate:
   * `gh` available (`Get-Command gh`); else `throw` with install hint.
   * Notes file exists; else `throw` naming expected path.
   * Installer file exists; else `throw` naming expected path. Script never builds.
   * Tag absent locally (`git tag --list $tag`) and on `origin` (`git ls-remote --tags origin refs/tags/$tag`); else `throw` "Tag already exists". Prevents re-publishing same version.
4. Notes text: read notes file, strip leading frontmatter block (first line `---` up to next `---` line), trim. Empty result: `throw`. Write text to temporary file (`[System.IO.Path]::GetTempFileName()`, UTF-8 without BOM); delete it in `finally`.
5. Create annotated tag on current `HEAD`: `git tag -a $tag -m "MD² $version"`. Push: `git push origin $tag`. HEAD means commit currently checked out; user is responsible for checking out release commit.
6. Create draft release with asset: `gh release create $tag $installerPath --title $version --notes-file $notesFile --verify-tag --draft`. `--verify-tag` makes `gh` fail instead of silently creating tag on GitHub. Draft keeps release hidden until upload finished.
7. Publish: `gh release edit $tag --draft=false`.
8. After each `git`/`gh` call check `$LASTEXITCODE`; non-zero: `throw` with command and step. Native commands do not trigger `$ErrorActionPreference`.
9. Output release URL (`gh release view $tag --json url --jq .url`).

Failure modes:

* Failure after tag push (step 6 or 7): tag and maybe draft stay on GitHub. Script does not roll back; error message lists cleanup: `gh release delete $tag --cleanup-tag` and `git tag -d $tag`. Rationale: rollback of remote state adds complexity for rare case.
* Only `.exe` uploaded; `.blockmap` excluded (spec names only installer; no auto-update consumes blockmap).

New test `scripts/publish_release.test.ps1`, same style as `scripts/update_version.test.ps1`. Fixture temp folder holds copied script, `desktop/package.json`, notes file, dummy installer. Test defines PowerShell functions `git` and `gh` before invoking script; functions take precedence over executables, so calls are recorded, nothing external runs. Stubs set `$global:LASTEXITCODE`.

Out of scope (not requested): action JSON in `design/actions` to run script from md2, building installer, CI workflow, renaming old tags or folders.

## Acceptance criteria

* Running `powershell -NoProfile -File scripts/publish_release.ps1` with version `0.8.3`, existing `design/releases/0.8.3/release_notes.md` and `release/MD2-Setup-0.8.3-x64.exe`:
  * creates and pushes annotated tag `v0.8.3` on `HEAD`;
  * creates published (non-draft) GitHub release for `v0.8.3` titled `0.8.3`;
  * release body equals `release_notes.md` content without frontmatter;
  * release has one asset `MD2-Setup-0.8.3-x64.exe`;
  * prints release URL.
* Missing notes file, missing installer, missing `gh`, or existing tag (local or `origin`): script exits non-zero with message naming cause; no tag created, nothing pushed, no `gh release` call.
* Failing `git`/`gh` call stops script with non-zero exit; message names failed step; after tag push, message includes cleanup commands.
* Temporary notes file removed on success and failure.
* `scripts/publish_release.test.ps1` covers: happy path (recorded `git`/`gh` arguments in order, notes without frontmatter), each validation failure (no remote-changing call recorded), non-zero exit from stubbed `gh release create`. Runs without network, git, or `gh`.