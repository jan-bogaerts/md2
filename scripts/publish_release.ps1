# Requires GitHub CLI (`gh`) installed and authenticated with `gh auth login`.
# The authenticated account needs permission to push tags and create releases on origin.

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repositoryRoot 'desktop/package.json'
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$manifest = [System.IO.File]::ReadAllText($manifestPath, $utf8) | ConvertFrom-Json
$version = $manifest.version
if ($null -eq $version -or $version -isnot [string] -or $version.Length -eq 0) {
    throw "Missing version in $manifestPath"
}

$tag = "v$version"
$notesPath = Join-Path $repositoryRoot "design/releases/$version/release_notes.md"
$installerPath = Join-Path $repositoryRoot "release/MD2-Setup-$version-x64.exe"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is missing. Install gh and run gh auth login.'
}
if (-not (Test-Path -LiteralPath $notesPath -PathType Leaf)) {
    throw "Release notes file missing: $notesPath"
}
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "Installer file missing: $installerPath"
}

$localTags = @(& git tag --list $tag)
if ($LASTEXITCODE -ne 0) { throw "Checking local tag failed: git tag --list $tag" }
if ($localTags.Count -gt 0) { throw "Tag already exists locally: $tag" }

$remoteTags = @(& git ls-remote --tags origin "refs/tags/$tag")
if ($LASTEXITCODE -ne 0) { throw "Checking origin tag failed: git ls-remote --tags origin refs/tags/$tag" }
if ($remoteTags.Count -gt 0) { throw "Tag already exists on origin: $tag" }

$notes = [System.IO.File]::ReadAllText($notesPath, $utf8)
$frontmatterPattern = '\A---[ \t]*\r?\n.*?^---[ \t]*(?:\r?\n|\z)'
$releaseNotes = [regex]::Replace($notes, $frontmatterPattern, '', 'Singleline, Multiline').Trim()
if ($notes -match '\A---(?:\r?\n|\z)' -and $releaseNotes -ceq $notes.Trim()) {
    throw "Release notes frontmatter is not closed: $notesPath"
}
if ($releaseNotes.Length -eq 0) { throw "Release notes are empty: $notesPath" }

$notesFile = [System.IO.Path]::GetTempFileName()
$tagPushed = $false
try {
    [System.IO.File]::WriteAllText($notesFile, $releaseNotes, $utf8)

    & git tag -a $tag -m "MD² $version" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Creating annotated tag failed: git tag -a $tag" }

    & git push origin $tag | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Pushing tag failed: git push origin $tag" }
    $tagPushed = $true

    & gh release create $tag $installerPath --title $version --notes-file $notesFile --verify-tag --draft | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Creating draft release failed: gh release create $tag" }

    & gh release edit $tag --draft=false | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Publishing release failed: gh release edit $tag --draft=false" }

    $releaseUrl = & gh release view $tag --json url --jq .url
    if ($LASTEXITCODE -ne 0) { throw "Reading release URL failed: gh release view $tag" }
    Write-Output $releaseUrl
} catch {
    if ($tagPushed) {
        throw "$($_.Exception.Message) Cleanup if needed: gh release delete $tag --cleanup-tag; git tag -d $tag"
    }
    throw
} finally {
    Remove-Item -LiteralPath $notesFile -Force
}
