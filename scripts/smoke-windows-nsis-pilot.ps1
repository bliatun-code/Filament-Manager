[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$Logs,
    [Parameter(Mandatory = $true)][string]$Fixture,
    [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-fA-F]{64}$")][string]$FixtureSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# The smoke runs against normal per-user app paths in a disposable CI profile.
if ($env:GITHUB_ACTIONS -cne "true" -or $env:RUNNER_ENVIRONMENT -cne "github-hosted") {
    throw "The NSIS pilot requires a GitHub-hosted Windows runner."
}
foreach ($name in @("FILAMENT_MANAGER_DB_PATH", "BAMBU_DB_PATH")) {
    if ([Environment]::GetEnvironmentVariable($name)) {
        throw "The smoke requires the default database location. Unset $name."
    }
}

$config = Get-Content (Join-Path $PSScriptRoot "../src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json
$pilot = Get-Content (Join-Path $PSScriptRoot "windows-nsis-pilot.json") -Raw | ConvertFrom-Json
$product = $config.productName
$installDirectory = Join-Path $env:LOCALAPPDATA $product
$dataDirectory = Join-Path $env:LOCALAPPDATA $config.identifier
$roamingDirectory = Join-Path $env:APPDATA $config.identifier
$installedApp = Join-Path $installDirectory "bambu-filament-manager.exe"
$uninstaller = Join-Path $installDirectory "uninstall.exe"
$database = Join-Path $dataDirectory "filament-manager.db"
$uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$nsisEntry = Join-Path $uninstallRoot $product
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "$product\$product.lnk"
# ProductCode from the exact, SHA-256-pinned v0.35.1 MSI below.
$productCode = "{BEFA7FBD-D3A2-43DD-8317-F4873A0A5A01}"

function Invoke-PilotInstaller {
    param([string]$FilePath, [string[]]$InstallerArguments, [int]$ExpectedExitCode = 0)

    $process = Start-Process -FilePath $FilePath -ArgumentList $InstallerArguments -Wait -PassThru
    if ($process.ExitCode -ne $ExpectedExitCode) {
        throw "Unexpected exit code $($process.ExitCode) for $FilePath. Expected $ExpectedExitCode."
    }
}

function Get-MsiState {
    param([string]$ProductCode)

    $installerApi = New-Object -ComObject WindowsInstaller.Installer
    try {
        return [int]$installerApi.GetType().InvokeMember(
            "ProductState", [Reflection.BindingFlags]::GetProperty, $null, $installerApi, @($ProductCode)
        )
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($installerApi)
    }
}

function Assert-Absent {
    param([string[]]$Paths)

    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) { throw "Unexpected existing path: $path" }
    }
}

function Test-InstalledApp {
    param([string]$Label)

    & node $databaseCheck prepare-launch $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "Could not prepare the default database for $Label startup." }

    $launch = @{
        FilePath = $installedApp
        WorkingDirectory = $installDirectory
        RedirectStandardOutput = (Join-Path $Logs "$Label-app-stdout.log")
        RedirectStandardError = (Join-Path $Logs "$Label-app-stderr.log")
        PassThru = $true
    }
    $app = Start-Process @launch
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        $verificationLog = Join-Path $Logs "$Label-database.log"
        do {
            $app.Refresh()
            if ($app.HasExited) { throw "$Label exited before the database was ready (code $($app.ExitCode))." }
            $result = & node $databaseCheck verify-launch $database $snapshot 2>&1
            $verificationExit = $LASTEXITCODE
            $result | Set-Content -LiteralPath $verificationLog
            if ($verificationExit -eq 0) {
                if ($app.WaitForExit(1000)) {
                    throw "$Label exited immediately after opening the database (code $($app.ExitCode))."
                }
                $result | Write-Host
                return
            }
            Start-Sleep -Seconds 1
        } while ([DateTime]::UtcNow -lt $deadline)
        throw "$Label did not open and verify the default database. See $verificationLog."
    }
    finally {
        $app.Refresh()
        if (-not $app.HasExited) {
            $app.Kill()
            if (-not $app.WaitForExit(15000)) { throw "$Label did not exit." }
        }
        $app.Dispose()
    }
}

function Assert-CandidateInstalled {
    $entry = Get-ItemProperty -LiteralPath $nsisEntry
    if ($entry.DisplayName -cne $product -or $entry.DisplayVersion -cne $pilot.version -or
        $entry.InstallLocation.Trim('"') -ne $installDirectory -or
        $entry.UninstallString.Trim('"') -ne $uninstaller) {
        throw "The NSIS entry does not match the expected per-user product identity."
    }
    if ((Get-FileHash -LiteralPath $installedApp).Hash -cne $candidateHash) {
        throw "The installed executable does not match the built NSIS candidate."
    }
    if (-not (Test-Path -LiteralPath $startMenuShortcut -PathType Leaf)) {
        throw "The NSIS installer did not recreate the existing Start Menu shortcut."
    }
}

function Get-PilotPayloadHash {
    $extractDirectory = Join-Path $env:RUNNER_TEMP "filament-manager-nsis-payload"
    New-Item -ItemType Directory -Path $extractDirectory | Out-Null
    $sevenZip = (Get-Command "7z.exe" -CommandType Application).Source
    & $sevenZip x "-o$extractDirectory" -y $Installer "-ir!bambu-filament-manager.exe" | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "Could not extract the app payload from the NSIS installer." }
    $payloads = @(Get-ChildItem -LiteralPath $extractDirectory -Recurse -Filter "bambu-filament-manager.exe" -File)
    if ($payloads.Count -ne 1) { throw "Expected exactly one application executable in the NSIS payload." }
    return (Get-FileHash -LiteralPath $payloads[0].FullName).Hash
}

New-Item -ItemType Directory -Path $Logs | Out-Null
Start-Transcript -Path (Join-Path $Logs "pilot-transcript.log")
try {
    Write-Host "Checking the clean per-user installation and library paths."
    Assert-Absent @($installDirectory, $dataDirectory, $roamingDirectory, $nsisEntry, $startMenuShortcut)
    if ((Get-MsiState $productCode) -ne -1) { throw "The baseline MSI is already registered." }

    $Installer = (Resolve-Path -LiteralPath $Installer).Path
    $candidateHash = Get-PilotPayloadHash
    $sourceMsi = Join-Path $env:RUNNER_TEMP "Filament-Manager_0.35.1_x64_en-US.msi"
    $sourceUri = "https://github.com/bliatun-code/Filament-Manager/releases/download/v0.35.1/Filament-Manager_0.35.1_x64_en-US.msi"
    & curl.exe --fail --location --silent --show-error --retry 3 --max-time 90 --output $sourceMsi $sourceUri
    if ($LASTEXITCODE -ne 0) { throw "The released MSI could not be downloaded." }
    $sourceHash = "b4e49f30a4f31662df1910e3c59ddff9100e59984b5f33b841bb05dacd65eda0"
    if ((Get-FileHash -LiteralPath $sourceMsi).Hash -ne $sourceHash) {
        throw "The published v0.35.1 MSI did not match its pinned SHA-256."
    }

    $msiLog = Join-Path $Logs "baseline-msi-install.log"
    $msiexec = Join-Path $env:SystemRoot "System32\msiexec.exe"
    Write-Host "Installing the published Filament Manager v0.35.1 MSI."
    Invoke-PilotInstaller $msiexec @("/i", ('"{0}"' -f $sourceMsi), "/qn", "/norestart", "/L*V", ('"{0}"' -f $msiLog))
    if ((Get-MsiState $productCode) -ne 5) { throw "Windows Installer did not report the MSI as installed." }
    if ((Get-FileHash -LiteralPath $installedApp).Hash -ceq $candidateHash) {
        throw "The released MSI and the candidate must install different binaries."
    }

    $databaseCheck = Join-Path $PSScriptRoot "windows-nsis-pilot-database.mjs"
    $snapshot = Join-Path $env:RUNNER_TEMP "filament-manager-nsis-library.json"
    if ((Get-FileHash -LiteralPath $Fixture).Hash -ne $FixtureSha256) {
        throw "The fixture does not match the same-run Linux job's SHA-256."
    }
    New-Item -ItemType Directory -Path $dataDirectory | Out-Null
    Copy-Item -LiteralPath $Fixture -Destination $database
    & node $databaseCheck capture $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "Could not capture the expected spool and printer identities and state." }
    Write-Host "Opening the historical library with the released MSI application."
    Test-InstalledApp "MSI"

    Write-Host "Migrating the installed MSI to the NSIS pilot."
    Invoke-PilotInstaller $Installer @("/S")
    if ((Get-MsiState $productCode) -ne -1) {
        throw "Windows Installer still reports the previous MSI as installed."
    }
    Assert-CandidateInstalled
    Write-Host "Reopening the same library with the installed NSIS application."
    Test-InstalledApp "NSIS"
    Write-Host "Uninstalling the NSIS application and checking that the library is retained."
    Invoke-PilotInstaller $uninstaller @("/S")
    Assert-Absent @($installedApp, $uninstaller, $nsisEntry, $startMenuShortcut, $roamingDirectory)
    & node $databaseCheck verify $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "NSIS uninstall did not preserve the library." }

    # Exercise the no-MSI branch in the same profile while retaining the library.
    Write-Host "Exercising clean NSIS installation and uninstall with the retained library."
    Invoke-PilotInstaller $Installer @("/S")
    Assert-CandidateInstalled
    Test-InstalledApp "NSIS-clean-install"
    Invoke-PilotInstaller $uninstaller @("/S")
    Assert-Absent @($installedApp, $uninstaller, $nsisEntry, $startMenuShortcut, $roamingDirectory)
    & node $databaseCheck verify $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "NSIS clean install and uninstall changed the library." }
    Write-Host "Passed the published MSI to NSIS upgrade, clean installation, and uninstall checks."
}
finally {
    Stop-Transcript
}
