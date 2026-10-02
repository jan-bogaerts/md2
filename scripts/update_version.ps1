param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Version
)

$ErrorActionPreference = 'Stop'

# npm and electron-builder expect a SemVer version.
$semverPattern = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
if ($Version -cnotmatch $semverPattern) {
    throw "Invalid version '$Version'. Expected a SemVer version such as 1.2.3 or 1.2.3-beta.1."
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$encoding = New-Object System.Text.UTF8Encoding($false, $true)
$versionLinePattern = '^(?<prefix>  "version"[ \t]*:[ \t]*")(?<version>[^"]+)(?<suffix>"[ \t]*,?[ \t\r]*)$'
$updates = @(
    foreach ($project in @('app', 'desktop')) {
        $manifestPath = Join-Path $repositoryRoot "$project/package.json"
        $original = [System.IO.File]::ReadAllText($manifestPath, $encoding)
        $manifest = $original | ConvertFrom-Json
        if ($null -eq $manifest.version -or $manifest.version -isnot [string]) {
            throw "Missing version in $manifestPath"
        }

        $matches = [regex]::Matches($original, $versionLinePattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        if ($matches.Count -ne 1 -or $matches[0].Groups['version'].Value -cne $manifest.version) {
            throw "Expected exactly one top-level version line in $manifestPath"
        }

        $match = $matches[0]
        $replacement = $match.Groups['prefix'].Value + $Version + $match.Groups['suffix'].Value
        $updated = $original.Substring(0, $match.Index) + $replacement + $original.Substring($match.Index + $match.Length)
        @{ Path = $manifestPath; Original = $original; Updated = $updated }
    }
)

$written = @()
try {
    foreach ($update in $updates) {
        if ($update.Original -ceq $update.Updated) { continue }
        $written += $update
        [System.IO.File]::WriteAllText($update.Path, $update.Updated, $encoding)
    }
} catch {
    foreach ($update in $written) {
        [System.IO.File]::WriteAllText($update.Path, $update.Original, $encoding)
    }
    throw
}

Write-Output "Updated app and desktop package.json to $Version"
