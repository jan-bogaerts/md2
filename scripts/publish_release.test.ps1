$ErrorActionPreference = 'Stop'

function Assert-Equal($Actual, $Expected, $Message) {
    if ($Actual -cne $Expected) { throw "$Message. Expected '$Expected', got '$Actual'." }
}

function Assert-Contains($Actual, $Expected, $Message) {
    if (-not $Actual.Contains($Expected)) { throw "$Message. Missing '$Expected' in '$Actual'." }
}

function New-Fixture($Directory, $ScriptPath) {
    $scriptsDirectory = Join-Path $Directory 'scripts'
    $desktopDirectory = Join-Path $Directory 'desktop'
    $releaseDirectory = Join-Path $Directory 'release'
    $notesDirectory = Join-Path $Directory 'design/releases/0.8.3'
    foreach ($path in @($scriptsDirectory, $desktopDirectory, $releaseDirectory, $notesDirectory)) {
        $null = New-Item -ItemType Directory -Path $path -Force
    }

    $fixtureScript = Join-Path $scriptsDirectory 'publish_release.ps1'
    $notesPath = Join-Path $notesDirectory 'release_notes.md'
    $installerPath = Join-Path $releaseDirectory 'MD2-Setup-0.8.3-x64.exe'
    Copy-Item -LiteralPath $ScriptPath -Destination $fixtureScript
    [System.IO.File]::WriteAllText((Join-Path $desktopDirectory 'package.json'), '{"version":"0.8.3"}')
    [System.IO.File]::WriteAllText($notesPath, "---`ninternalId: test`n---`n# MD² 0.8.3`n`n* Change`n")
    [System.IO.File]::WriteAllText($installerPath, 'dummy installer')
    return @{ Script = $fixtureScript; Notes = $notesPath; Installer = $installerPath }
}

function Reset-Stubs {
    $global:ReleaseCalls = @()
    $global:MissingGh = $false
    $global:LocalTagExists = $false
    $global:RemoteTagExists = $false
    $global:CreateFails = $false
    $global:PushFails = $false
    $global:CapturedNotes = $null
    $global:TemporaryNotesPath = $null
    $global:LASTEXITCODE = 0
}

function Get-Command {
    if ($global:MissingGh) { return $null }
    return Microsoft.PowerShell.Core\Get-Command gh -ErrorAction SilentlyContinue
}

function git {
    $global:ReleaseCalls += @{ Command = 'git'; Arguments = @($args) }
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'tag' -and $args[1] -eq '--list' -and $global:LocalTagExists) { return 'v0.8.3' }
    if ($args[0] -eq 'ls-remote' -and $global:RemoteTagExists) { return 'remote refs/tags/v0.8.3' }
    if ($args[0] -eq 'push' -and $global:PushFails) { $global:LASTEXITCODE = 1 }
}

function gh {
    $global:ReleaseCalls += @{ Command = 'gh'; Arguments = @($args) }
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'release' -and $args[1] -eq 'create') {
        $notesIndex = [array]::IndexOf($args, '--notes-file')
        $global:TemporaryNotesPath = $args[$notesIndex + 1]
        $global:CapturedNotes = [System.IO.File]::ReadAllText($global:TemporaryNotesPath)
        if ($global:CreateFails) { $global:LASTEXITCODE = 1 }
    }
    if ($args[0] -eq 'release' -and $args[1] -eq 'view') { return 'https://github.com/example/md2/releases/tag/v0.8.3' }
}

function Assert-Call($Index, $Command, $Arguments) {
    $call = $global:ReleaseCalls[$Index]
    Assert-Equal $call.Command $Command "Call $Index command"
    Assert-Equal ($call.Arguments -join '|') ($Arguments -join '|') "Call $Index arguments"
}

function Assert-NoChanges {
    foreach ($call in $global:ReleaseCalls) {
        $arguments = $call.Arguments -join ' '
        if ($call.Command -eq 'gh' -or $arguments.StartsWith('tag -a ') -or $arguments.StartsWith('push ')) {
            throw "Validation changed release state: $($call.Command) $arguments"
        }
    }
}

function Assert-Failure($Fixture, $ExpectedMessage) {
    $message = $null
    try { $null = & $Fixture.Script } catch { $message = $_.Exception.Message }
    if ($null -eq $message) { throw "Expected failure: $ExpectedMessage" }
    Assert-Contains $message $ExpectedMessage 'Failure message'
    return $message
}

$tempDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $tempDirectory
try {
    $scriptPath = Join-Path $PSScriptRoot 'publish_release.ps1'
    $fixture = New-Fixture (Join-Path $tempDirectory 'success') $scriptPath
    Reset-Stubs
    Push-Location $tempDirectory
    try { $releaseUrl = & $fixture.Script } finally { Pop-Location }
    Assert-Equal $releaseUrl 'https://github.com/example/md2/releases/tag/v0.8.3' 'Release URL'
    Assert-Equal $global:ReleaseCalls.Count 7 'Release command count'
    Assert-Call 0 'git' @('tag', '--list', 'v0.8.3')
    Assert-Call 1 'git' @('ls-remote', '--tags', 'origin', 'refs/tags/v0.8.3')
    Assert-Call 2 'git' @('tag', '-a', 'v0.8.3', '-m', 'MD² 0.8.3')
    Assert-Call 3 'git' @('push', 'origin', 'v0.8.3')
    Assert-Call 4 'gh' @('release', 'create', 'v0.8.3', $fixture.Installer, '--title', '0.8.3', '--notes-file', $global:TemporaryNotesPath, '--verify-tag', '--draft')
    Assert-Call 5 'gh' @('release', 'edit', 'v0.8.3', '--draft=false')
    Assert-Call 6 'gh' @('release', 'view', 'v0.8.3', '--json', 'url', '--jq', '.url')
    Assert-Equal $global:CapturedNotes "# MD² 0.8.3`n`n* Change" 'Release notes without frontmatter'
    if (Test-Path -LiteralPath $global:TemporaryNotesPath) { throw 'Temporary notes file remains after success' }

    $fixture = New-Fixture (Join-Path $tempDirectory 'missing_notes') $scriptPath
    Remove-Item -LiteralPath $fixture.Notes
    Reset-Stubs
    $null = Assert-Failure $fixture 'Release notes file missing:'
    Assert-NoChanges

    $fixture = New-Fixture (Join-Path $tempDirectory 'missing_installer') $scriptPath
    Remove-Item -LiteralPath $fixture.Installer
    Reset-Stubs
    $null = Assert-Failure $fixture 'Installer file missing:'
    Assert-NoChanges

    $fixture = New-Fixture (Join-Path $tempDirectory 'missing_gh') $scriptPath
    Reset-Stubs
    $global:MissingGh = $true
    $null = Assert-Failure $fixture 'GitHub CLI (gh) is missing'
    Assert-NoChanges

    $fixture = New-Fixture (Join-Path $tempDirectory 'local_tag') $scriptPath
    Reset-Stubs
    $global:LocalTagExists = $true
    $null = Assert-Failure $fixture 'Tag already exists locally: v0.8.3'
    Assert-NoChanges

    $fixture = New-Fixture (Join-Path $tempDirectory 'remote_tag') $scriptPath
    Reset-Stubs
    $global:RemoteTagExists = $true
    $null = Assert-Failure $fixture 'Tag already exists on origin: v0.8.3'
    Assert-NoChanges

    $fixture = New-Fixture (Join-Path $tempDirectory 'create_failure') $scriptPath
    Reset-Stubs
    $global:CreateFails = $true
    $message = Assert-Failure $fixture 'Creating draft release failed'
    Assert-Contains $message 'gh release delete v0.8.3 --cleanup-tag' 'Remote cleanup command'
    Assert-Contains $message 'git tag -d v0.8.3' 'Local cleanup command'
    Assert-Equal $global:ReleaseCalls.Count 5 'Commands stopped after release creation failure'
    if (Test-Path -LiteralPath $global:TemporaryNotesPath) { throw 'Temporary notes file remains after failure' }

    $fixture = New-Fixture (Join-Path $tempDirectory 'push_failure') $scriptPath
    Reset-Stubs
    $global:PushFails = $true
    $null = Assert-Failure $fixture 'Pushing tag failed'
    Assert-Equal $global:ReleaseCalls.Count 4 'Commands stopped after tag push failure'
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
}

Write-Output 'Release publishing tests passed.'
