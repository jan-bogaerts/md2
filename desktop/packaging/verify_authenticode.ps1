param(
    [Parameter(Mandatory = $true)]
    [string[]] $ArtifactPath,

    [string] $ExpectedPublisher
)

$ErrorActionPreference = 'Stop'

foreach ($path in $ArtifactPath) {
    $signature = Get-AuthenticodeSignature -LiteralPath $path
    if ($signature.Status -ne 'Valid') {
        throw "Invalid Authenticode signature for $path`: $($signature.Status)"
    }
    if ($ExpectedPublisher -and $signature.SignerCertificate.Subject.IndexOf(
        $ExpectedPublisher,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -lt 0) {
        throw "Unexpected Authenticode publisher for $path`: $($signature.SignerCertificate.Subject)"
    }
    if ($null -eq $signature.TimeStamperCertificate) {
        throw "Missing Authenticode timestamp for $path"
    }
}
