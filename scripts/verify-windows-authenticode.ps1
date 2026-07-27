[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$FilePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedPublisherSubject,

    [Parameter(Mandatory = $false)]
    [string]$SignToolPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "Authenticode verification must run on Windows."
}

function Resolve-SignToolExecutable {
    param([AllowEmptyString()][string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        $resolvedRequestedPath = (Resolve-Path -LiteralPath $RequestedPath).Path
        if (-not (Test-Path -LiteralPath $resolvedRequestedPath -PathType Leaf)) {
            throw "SignTool path is not a file: $resolvedRequestedPath"
        }
        return $resolvedRequestedPath
    }

    $signToolCommand = Get-Command "signtool.exe" -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $signToolCommand) {
        return $signToolCommand.Source
    }

    $programFilesX86 = ${env:ProgramFiles(x86)}
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $windowsKitsBin = Join-Path $programFilesX86 "Windows Kits\10\bin"
        if (Test-Path -LiteralPath $windowsKitsBin -PathType Container) {
            $candidate = Get-ChildItem -LiteralPath $windowsKitsBin -Filter "signtool.exe" -File -Recurse |
                Where-Object { $_.FullName -match '[\\/]x64[\\/]signtool[.]exe$' } |
                Sort-Object -Property FullName -Descending |
                Select-Object -First 1
            if ($null -ne $candidate) {
                return $candidate.FullName
            }
        }
    }

    throw "signtool.exe was not found in PATH or the Windows 10 SDK."
}

function Test-CodeSigningEnhancedKeyUsage {
    param(
        [Parameter(Mandatory = $true)]
        [Security.Cryptography.X509Certificates.X509Certificate2]$Certificate
    )

    $codeSigningOid = "1.3.6.1.5.5.7.3.3"
    foreach ($extension in $Certificate.Extensions) {
        if (-not [string]::Equals($extension.Oid.Value, "2.5.29.37", [StringComparison]::Ordinal)) {
            continue
        }

        $enhancedKeyUsage = [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
            $extension,
            $extension.Critical
        )
        foreach ($usage in $enhancedKeyUsage.EnhancedKeyUsages) {
            if ([string]::Equals($usage.Value, $codeSigningOid, [StringComparison]::Ordinal)) {
                return $true
            }
        }
    }

    return $false
}

$resolvedSignToolPath = Resolve-SignToolExecutable -RequestedPath $SignToolPath
$normalizedPublisherSubject = $ExpectedPublisherSubject.Trim()
if ([string]::IsNullOrWhiteSpace($normalizedPublisherSubject)) {
    throw "ExpectedPublisherSubject must contain a publisher certificate subject."
}

foreach ($candidatePath in $FilePath) {
    $resolvedFilePath = (Resolve-Path -LiteralPath $candidatePath).Path
    if (-not (Test-Path -LiteralPath $resolvedFilePath -PathType Leaf)) {
        throw "Authenticode target is not a file: $resolvedFilePath"
    }

    $target = Get-Item -LiteralPath $resolvedFilePath
    if ($target.Length -le 0) {
        throw "Authenticode target is empty: $resolvedFilePath"
    }

    $extension = [IO.Path]::GetExtension($resolvedFilePath).ToLowerInvariant()
    if ($extension -notin @(".exe", ".msi")) {
        throw "Authenticode verification only accepts EXE and MSI files: $resolvedFilePath"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $resolvedFilePath
    if (-not [string]::Equals([string]$signature.Status, "Valid", [StringComparison]::Ordinal)) {
        throw "Authenticode status for '$resolvedFilePath' is '$($signature.Status)': $($signature.StatusMessage)"
    }
    if ($null -eq $signature.SignerCertificate) {
        throw "Authenticode signer certificate is missing for '$resolvedFilePath'."
    }

    $actualPublisherSubject = $signature.SignerCertificate.Subject.Trim()
    if (-not [string]::Equals(
        $actualPublisherSubject,
        $normalizedPublisherSubject,
        [StringComparison]::Ordinal
    )) {
        throw "Publisher subject mismatch for '$resolvedFilePath': expected '$normalizedPublisherSubject', found '$actualPublisherSubject'."
    }
    if (-not (Test-CodeSigningEnhancedKeyUsage -Certificate $signature.SignerCertificate)) {
        throw "Signer certificate for '$resolvedFilePath' does not contain the Code Signing EKU (1.3.6.1.5.5.7.3.3)."
    }
    if ($null -eq $signature.TimeStamperCertificate) {
        throw "A trusted timestamp certificate is required for '$resolvedFilePath'."
    }

    $signToolOutput = & $resolvedSignToolPath verify /pa /all /v /tw $resolvedFilePath 2>&1
    $signToolExitCode = $LASTEXITCODE
    $signToolOutput | ForEach-Object { Write-Host $_ }
    if ($signToolExitCode -ne 0) {
        throw "signtool verification failed for '$resolvedFilePath' with exit code $signToolExitCode."
    }
    $signToolWarnings = @(
        $signToolOutput |
            Where-Object { [string]$_ -match '(?i)\bSignTool Warning\b' }
    )
    if ($signToolWarnings.Count -ne 0) {
        throw "signtool reported a verification warning for '$resolvedFilePath': $($signToolWarnings -join ' ')"
    }

    Write-Host "Verified Authenticode signature and timestamp for $resolvedFilePath."
}
