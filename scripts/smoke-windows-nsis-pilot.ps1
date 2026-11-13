[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$Candidate,
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

function Invoke-PilotInstaller {
    param([string]$FilePath, [string[]]$InstallerArguments, [int]$ExpectedExitCode = 0)

    $process = Start-Process -FilePath $FilePath -ArgumentList $InstallerArguments -Wait -PassThru
    if ($process.ExitCode -ne $ExpectedExitCode) {
        throw "Unexpected exit code $($process.ExitCode) for $FilePath. Expected $ExpectedExitCode."
    }
}

function Get-MsiRegistration {
    Get-ChildItem -LiteralPath $uninstallRoot | Where-Object {
        $_.GetValue("WindowsInstaller") -eq 1 -and
        $_.GetValue("DisplayName") -ceq $product -and
        $_.GetValue("DisplayVersion") -ceq "0.35.1"
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

function Test-DefaultDatabaseOpen {
    # SQLite holds the default file open while the app is running. An exclusive
    # open can succeed only when the app is no longer using that file.
    try {
        $stream = [IO.File]::Open($database, "Open", "Read", "None")
        $stream.Dispose()
        return $false
    }
    catch [IO.IOException] {
        if (($_.Exception.HResult -band 0xffff) -ne 32) { throw }
        return $true
    }
}

function Test-InstalledApp {
    param([string]$Label)

    if (Test-DefaultDatabaseOpen) { throw "The database is already open." }
    $app = Start-Process -FilePath $installedApp -WorkingDirectory $installDirectory -PassThru
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        $verificationLog = Join-Path $Logs "$Label-database.log"
        do {
            $app.Refresh()
            if ($app.HasExited) { throw "$Label exited before the database was ready." }
            if (Test-DefaultDatabaseOpen) {
                $result = & node $databaseCheck verify $database $snapshot 2>&1
                $result | Set-Content -LiteralPath $verificationLog
                if ($LASTEXITCODE -eq 0) {
                    $result | Write-Host
                    return
                }
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

New-Item -ItemType Directory -Path $Logs | Out-Null
Start-Transcript -Path (Join-Path $Logs "pilot-transcript.log")
try {
    Assert-Absent @($installDirectory, $dataDirectory, $roamingDirectory, $nsisEntry, $startMenuShortcut)
    if (@(Get-MsiRegistration).Count) { throw "The baseline MSI is already registered." }

    $Installer = (Resolve-Path -LiteralPath $Installer).Path
    $candidateHash = (Get-FileHash -LiteralPath $Candidate).Hash
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
    Invoke-PilotInstaller $msiexec @("/i", ('"{0}"' -f $sourceMsi), "/qn", "/norestart", "/L*V", ('"{0}"' -f $msiLog))
    $registration = @(Get-MsiRegistration)
    if ($registration.Count -ne 1) { throw "Expected exactly one installed per-user v0.35.1 MSI." }
    $productCode = $registration[0].PSChildName
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
    Test-InstalledApp "MSI"

    Invoke-PilotInstaller $Installer @("/S")
    if ((Get-MsiState $productCode) -ne -1 -or @(Get-MsiRegistration).Count) {
        throw "Windows Installer still reports the previous MSI as installed."
    }
    Assert-CandidateInstalled
    Test-InstalledApp "NSIS"
    Invoke-PilotInstaller $uninstaller @("/S")
    Assert-Absent @($installedApp, $uninstaller, $nsisEntry, $startMenuShortcut, $roamingDirectory)
    & node $databaseCheck verify $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "NSIS uninstall did not preserve the library." }

    # Exercise the no-MSI branch in the same profile while retaining the library.
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
