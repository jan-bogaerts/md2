$ErrorActionPreference = 'Stop'

function Assert-Equal($Actual, $Expected, $Message) {
    if ($Actual -cne $Expected) { throw "$Message. Expected '$Expected', got '$Actual'." }
}

function New-Fixture($Directory, $ScriptPath) {
    $scriptsDirectory = Join-Path $Directory 'scripts'
    $null = New-Item -ItemType Directory -Path $scriptsDirectory -Force
    Copy-Item -LiteralPath $ScriptPath -Destination (Join-Path $scriptsDirectory 'update_version.ps1')
    foreach ($project in @('app', 'desktop')) {
        $projectDirectory = Join-Path $Directory $project
        $null = New-Item -ItemType Directory -Path $projectDirectory -Force
        $manifest = "{`r`n  `"name`": `"$project`",`r`n  `"version`": `"0.7.1`",`r`n  `"private`": true`r`n}`r`n"
        [System.IO.File]::WriteAllText((Join-Path $projectDirectory 'package.json'), $manifest)
        [System.IO.File]::WriteAllText((Join-Path $projectDirectory 'package-lock.json'), 'unchanged lockfile')
    }

    return Join-Path $scriptsDirectory 'update_version.ps1'
}

$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $tempDirectory
try {
    $scriptPath = Join-Path $PSScriptRoot 'update_version.ps1'
    $validDirectory = Join-Path $tempDirectory 'valid'
    $fixtureScript = New-Fixture $validDirectory $scriptPath
    $null = & $fixtureScript -Version '1.2.3-beta.1+build.4'
    foreach ($project in @('app', 'desktop')) {
        $manifest = [System.IO.File]::ReadAllText((Join-Path $validDirectory "$project/package.json"))
        Assert-Equal (($manifest | ConvertFrom-Json).version) '1.2.3-beta.1+build.4' "$project version"
        if (-not $manifest.Contains("`r`n")) { throw "$project line endings changed" }
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $validDirectory "$project/package-lock.json"))) 'unchanged lockfile' "$project lockfile"
    }

    $invalidDirectory = Join-Path $tempDirectory 'invalid'
    $fixtureScript = New-Fixture $invalidDirectory $scriptPath
    $invalidVersionFailed = $false
    try { $null = & $fixtureScript -Version '1.02.3' } catch { $invalidVersionFailed = $true }
    if (-not $invalidVersionFailed) { throw 'Invalid version was accepted' }
    foreach ($project in @('app', 'desktop')) {
        $manifest = [System.IO.File]::ReadAllText((Join-Path $invalidDirectory "$project/package.json")) | ConvertFrom-Json
        Assert-Equal $manifest.version '0.7.1' "$project changed after invalid version"
    }

    $missingDirectory = Join-Path $tempDirectory 'missing'
    $fixtureScript = New-Fixture $missingDirectory $scriptPath
    [System.IO.File]::WriteAllText((Join-Path $missingDirectory 'desktop/package.json'), '{"name":"desktop"}')
    $missingVersionFailed = $false
    try { $null = & $fixtureScript -Version '1.2.3' } catch { $missingVersionFailed = $true }
    if (-not $missingVersionFailed) { throw 'Missing desktop version was accepted' }
    $appManifest = [System.IO.File]::ReadAllText((Join-Path $missingDirectory 'app/package.json')) | ConvertFrom-Json
    Assert-Equal $appManifest.version '0.7.1' 'App changed before desktop manifest validation'
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
}

Write-Output 'Version update tests passed.'
