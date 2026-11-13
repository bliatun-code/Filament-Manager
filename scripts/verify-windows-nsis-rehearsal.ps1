[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$ExpectedProductName,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$ExpectedVersion,
    [string]$StageFrom = "",
    [ValidatePattern('^[0-9a-fA-F]{64}$')]
    [string]$ExpectedInstallerSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-UnsignedFile {
    param([string]$Path)

    if ((Get-AuthenticodeSignature -LiteralPath $Path).Status -ne "NotSigned") {
        throw "Expected an unsigned Windows rehearsal artifact: $Path"
    }
}

function Assert-X64Application {
    param([string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5a4d -or $stream.Length -lt 64) {
            throw "The NSIS payload is not a Windows executable."
        }
        $stream.Position = 0x3c
        $peOffset = $reader.ReadUInt32()
        if ($peOffset -lt 64 -or $peOffset -gt $stream.Length - 26) {
            throw "The NSIS payload has an invalid PE header offset."
        }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x4550 -or $reader.ReadUInt16() -ne 0x8664) {
            throw "The NSIS payload does not contain an x64 application."
        }
        $stream.Position = $peOffset + 24
        if ($reader.ReadUInt16() -ne 0x20b) {
            throw "The NSIS payload does not have the expected 64-bit PE format."
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Assert-ProductIdentity {
    param([string]$Path)

    $identity = [Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    if ($identity.ProductName -cne $ExpectedProductName -or $identity.ProductVersion -cne $ExpectedVersion) {
        throw "Unexpected product name or version in $Path. Expected $ExpectedProductName $ExpectedVersion, found $($identity.ProductName) $($identity.ProductVersion)."
    }
}

$normalizedName = "Filament-Manager_${ExpectedVersion}_x64-setup.exe"
$manifestName = "SHA256SUMS-windows.txt"
$staging = -not [string]::IsNullOrWhiteSpace($StageFrom)
if ($staging) {
    if (Test-Path -LiteralPath $Directory) { throw "The NSIS staging directory already exists." }
    $built = @(Get-ChildItem -LiteralPath $StageFrom -Filter "*.exe" -File)
    $expectedBuildName = "${ExpectedProductName}_${ExpectedVersion}_x64-setup.exe"
    if ($built.Count -ne 1 -or $built[0].Name -cne $expectedBuildName) {
        throw "Expected exactly one x64 NSIS installer named $expectedBuildName."
    }
    New-Item -ItemType Directory -Path $Directory | Out-Null
    Copy-Item -LiteralPath $built[0].FullName -Destination (Join-Path $Directory $normalizedName)
}
elseif ([string]::IsNullOrWhiteSpace($ExpectedInstallerSha256)) {
    throw "An expected SHA-256 from the build job is required to verify a downloaded candidate."
}

$candidates = @(Get-ChildItem -LiteralPath $Directory -Filter "*.exe" -File)
if ($candidates.Count -ne 1 -or $candidates[0].Name -cne $normalizedName -or $candidates[0].Length -le 0) {
    throw "Expected exactly one non-empty installer named $normalizedName."
}
$installer = $candidates[0].FullName
$installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$checksum = "$installerHash *$normalizedName"
$manifestPath = Join-Path $Directory $manifestName
if (-not $staging) {
    if ($installerHash -ne $ExpectedInstallerSha256 -or
        (Get-Content -LiteralPath $manifestPath -Raw).TrimEnd("`r", "`n") -cne $checksum) {
        throw "The downloaded NSIS installer differs from the checked build or checksum manifest."
    }
}

Assert-UnsignedFile -Path $installer
Assert-ProductIdentity -Path $installer
$sevenZip = (Get-Command "7z.exe" -CommandType Application).Source
$inspection = New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP "nsis-inspection-$([Guid]::NewGuid().ToString('N'))")
try {
    & $sevenZip x -tPE "-o$($inspection.FullName)" -y $installer ".rsrc/MANIFEST/*" | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "Could not read the NSIS bootstrap manifest." }
    $resources = @(Get-ChildItem -LiteralPath (Join-Path $inspection.FullName ".rsrc/MANIFEST") -File)
    if ($resources.Count -ne 1) { throw "Expected one NSIS bootstrap manifest." }
    $applicationManifest = [xml](Get-Content -LiteralPath $resources[0].FullName -Raw)
    $executionLevels = $applicationManifest.SelectNodes("//*[local-name()='requestedExecutionLevel']")
    if ($executionLevels.Count -ne 1 -or $executionLevels[0].GetAttribute("level") -cne "asInvoker" -or
        $executionLevels[0].GetAttribute("uiAccess") -cne "false") {
        throw "The NSIS rehearsal bootstrap must run as the current user without elevation."
    }

    & $sevenZip x "-o$($inspection.FullName)" -y $installer "-ir!bambu-filament-manager.exe" | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "Could not extract the NSIS application payload." }
    $payloads = @(Get-ChildItem -LiteralPath $inspection.FullName -Recurse -Filter "bambu-filament-manager.exe" -File)
    if ($payloads.Count -ne 1) { throw "Expected exactly one application executable in the NSIS payload." }
    $payload = $payloads[0].FullName
    Assert-X64Application -Path $payload
    Assert-ProductIdentity -Path $payload
    Assert-UnsignedFile -Path $payload
    $payloadHash = (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($staging) { Set-Content -LiteralPath $manifestPath -Value $checksum -Encoding ascii }
    [PSCustomObject]@{
        Installer = $installer
        InstallerSha256 = $installerHash
        PayloadSha256 = $payloadHash
    }
}
finally {
    Remove-Item -LiteralPath $inspection.FullName -Recurse -Force
}
