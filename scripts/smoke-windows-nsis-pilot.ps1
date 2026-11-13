[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$Logs,
    [Parameter(Mandatory = $true)][string]$Fixture,
    [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-fA-F]{64}$")][string]$FixtureSha256,
    [Parameter(Mandatory = $true)][string]$SourceManifest,
    [Parameter(Mandatory = $true)][ValidatePattern('^v[0-9]+\.[0-9]+\.[0-9]+$')][string]$SourceVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedNsisVersion,
    [ValidateSet("standard", "custom-directory", "running-app", "interactive")][string]$Scenario = "standard",
    [string]$NextInstaller,
    [string]$NextVersion
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
$sources = Get-Content -LiteralPath $SourceManifest -Raw | ConvertFrom-Json -AsHashtable
$source = $sources[$SourceVersion]
$assetName = "Filament-Manager_$($SourceVersion.Substring(1))_x64_en-US.msi"
if ($null -eq $source -or $source.asset -cne $assetName -or
    $source.sha256 -cnotmatch '^[0-9a-f]{64}$' -or
    $source.productCode -notmatch '^\{[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}\}$') {
    throw "No valid published MSI metadata for $SourceVersion."
}
if ($Scenario -eq "interactive" -and (-not $NextInstaller -or -not $NextVersion)) {
    throw "The interactive scenario needs two successive NSIS installers."
}

$product = $config.productName
$defaultInstallDirectory = Join-Path $env:LOCALAPPDATA $product
$installDirectory = $defaultInstallDirectory
if ($Scenario -eq "custom-directory") {
    $installDirectory = Join-Path $env:LOCALAPPDATA "Filament Manager - custom installation"
}
$dataDirectory = Join-Path $env:LOCALAPPDATA $config.identifier
$roamingDirectory = Join-Path $env:APPDATA $config.identifier
$installedApp = Join-Path $installDirectory "bambu-filament-manager.exe"
$uninstaller = Join-Path $installDirectory "uninstall.exe"
$database = Join-Path $dataDirectory "filament-manager.db"
$uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$nsisEntry = Join-Path $uninstallRoot $product
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "$product\$product.lnk"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("DesktopDirectory")) "$product.lnk"
$runRegistry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$approvalRegistry = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
$autostartId = $config.identifier
$autostartCommand = '"{0}" --background' -f $installedApp
$productCode = $source.productCode

# Cover an absent registration, Windows-approved startup and Windows-disabled startup.
$approval = switch ($SourceVersion) {
    "v0.33.0" { $null }
    "v0.35.0" { [byte[]](3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8) }
    default { [byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) }
}
if ($Scenario -eq "interactive") {
    $approval = [byte[]](3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8)
}

function Invoke-PilotInstaller {
    param([string]$FilePath, [string[]]$InstallerArguments, [int]$ExpectedExitCode = 0)

    $process = Start-Process -FilePath $FilePath -ArgumentList $InstallerArguments -Wait -PassThru
    try {
        if ($process.ExitCode -ne $ExpectedExitCode) {
            throw "Unexpected exit code $($process.ExitCode) for $FilePath. Expected $ExpectedExitCode."
        }
    }
    finally {
        $process.Dispose()
    }
}

function Invoke-InteractiveInstaller {
    param([string]$FilePath)

    if (-not ("FilamentManagerInstallerDialog" -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class FilamentManagerInstallerDialog {
    private delegate bool WindowCallback(IntPtr hwnd, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr hwnd, WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);

    public static int ProcessId(IntPtr hwnd) {
        GetWindowThreadProcessId(hwnd, out int pid);
        return pid;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(
        IntPtr hwnd, uint message, IntPtr wParam, StringBuilder lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr SendMessageTimeout(
        IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    public static string Label(IntPtr hwnd) {
        var text = new StringBuilder(512);
        SendMessageTimeout(hwnd, 0x0D, new IntPtr(text.Capacity), text, 2, 500, out _);
        return text.ToString().Replace("&", "").Trim();
    }

    public static IntPtr[] Visible(IntPtr parent, string className) {
        var matches = new List<IntPtr>();
        WindowCallback visit = (hwnd, _) => {
            var name = new StringBuilder(64);
            GetClassName(hwnd, name, name.Capacity);
            if (IsWindowVisible(hwnd) && name.ToString() == className)
                matches.Add(hwnd);
            return true;
        };
        if (parent == IntPtr.Zero) EnumWindows(visit, IntPtr.Zero);
        else EnumChildWindows(parent, visit, IntPtr.Zero);
        return matches.ToArray();
    }

    public static void SetChecked(IntPtr hwnd, bool check) {
        SendMessageTimeout(hwnd, 0xF1, check ? new IntPtr(1) : IntPtr.Zero, IntPtr.Zero, 2, 500, out _);
    }

    public static bool Click(IntPtr hwnd) {
        return PostMessage(hwnd, 0xF5, IntPtr.Zero, IntPtr.Zero);
    }
}
'@
    }

    $process = Start-Process -FilePath $FilePath -PassThru
    $uninstalling = (Split-Path -Leaf $FilePath) -eq "uninstall.exe"
    $seen = [Collections.Generic.List[string]]::new()
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds(90)
        do {
            $visibleDialog = $false
            foreach ($window in [FilamentManagerInstallerDialog]::Visible([IntPtr]::Zero, "#32770")) {
                if ([FilamentManagerInstallerDialog]::Label($window) -notlike "$product*" -or
                    (-not $uninstalling -and [FilamentManagerInstallerDialog]::ProcessId($window) -ne $process.Id)) {
                    continue
                }
                $visibleDialog = $true
                $buttons = [FilamentManagerInstallerDialog]::Visible($window, "Button")
                foreach ($control in $buttons) {
                    $label = [FilamentManagerInstallerDialog]::Label($control)
                    if ($label -match '(?i)delete app data') {
                        throw "Interactive uninstall exposes deletion of the library."
                    }
                    if ($label -match '(?i)^(run|launch) .*Filament Manager') {
                        [FilamentManagerInstallerDialog]::SetChecked($control, $false)
                    }
                    if ($label -match '(?i)create .*desktop') {
                        [FilamentManagerInstallerDialog]::SetChecked($control, $true)
                    }
                }
                foreach ($control in $buttons) {
                    $label = [FilamentManagerInstallerDialog]::Label($control)
                    if (-not [FilamentManagerInstallerDialog]::IsWindowEnabled($control) -or
                        $label -notmatch '^(Next\s*>?|Install|Uninstall|Finish|Close)$') { continue }
                    if ([FilamentManagerInstallerDialog]::Click($control)) {
                        $seen.Add($label)
                        break
                    }
                }
            }

            # NSIS can fork the uninstaller into a temporary executable, so require
            # the actual confirmation control and wait until its dialog closes.
            $action = if ($uninstalling) { "Uninstall" } else { "Install" }
            $terminal = $seen.Contains("Finish") -or $seen.Contains("Close")
            if (-not $visibleDialog -and $seen.Contains($action) -and
                ($terminal -or ($uninstalling -and -not (Test-Path -LiteralPath $nsisEntry))) -and
                $process.WaitForExit(1000)) {
                if ($process.ExitCode -ne 0) { throw "Interactive installer exited with code $($process.ExitCode)." }
                Write-Host "Verified interactive pages: $($seen -join ', ')"
                return
            }
            Start-Sleep -Milliseconds 350
        } while ([DateTime]::UtcNow -lt $deadline)
        throw "Interactive installer did not finish within 90 seconds. Buttons used: $($seen -join ', ')"
    }
    finally {
        $process.Dispose()
    }
}

function Get-AutostartValue {
    param([string]$RegistryPath, [string]$Name = $autostartId)

    if (Test-Path -LiteralPath $RegistryPath) {
        $key = Get-Item -LiteralPath $RegistryPath
        try {
            $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if ($null -ne $value) { return ,$value }
        }
        finally {
            $key.Dispose()
        }
    }
}

function Assert-Autostart {
    param([bool]$Preserved)

    $actualRun = Get-AutostartValue $runRegistry
    $actualApproval = Get-AutostartValue $approvalRegistry
    if ($Preserved -and $null -ne $approval) {
        if ($actualRun -cne $autostartCommand -or $actualApproval -isnot [byte[]] -or
            [Convert]::ToHexString($actualApproval) -cne [Convert]::ToHexString([byte[]]$approval)) {
            throw "Windows launch-at-login registration or approval changed."
        }
    }
    elseif ($null -ne $actualRun -or $null -ne $actualApproval) {
        throw "Windows launch at login was registered without a previous choice."
    }
    if ($null -ne (Get-AutostartValue $runRegistry $product) -or
        $null -ne (Get-AutostartValue $approvalRegistry $product)) {
        throw "The installer left an unexpected legacy startup value."
    }
}

function Set-TestAutostart {
    if ($null -eq $approval) { return }
    foreach ($registryPath in @($runRegistry, $approvalRegistry)) {
        if (-not (Test-Path -LiteralPath $registryPath)) {
            New-Item -Path $registryPath -Force | Out-Null
        }
    }
    New-ItemProperty -LiteralPath $runRegistry -Name $autostartId -PropertyType String -Value $autostartCommand | Out-Null
    New-ItemProperty -LiteralPath $approvalRegistry -Name $autostartId -PropertyType Binary -Value ([byte[]]$approval) | Out-Null
}

function Assert-InstallerPath {
    param([bool]$Expected)

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($userPath -split ";" | ForEach-Object { $_.Trim().Trim('"').TrimEnd('\') })
    if (($entries -contains $installDirectory) -ne $Expected) {
        throw "Unexpected Windows user PATH entry for the application directory (expected present: $Expected)."
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
    param([string]$Label, [switch]$Legacy)

    $verificationCommand = if ($Legacy) { "verify-legacy-launch" } else { "verify-launch" }
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
            $result = & node $databaseCheck $verificationCommand $database $snapshot 2>&1
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
    param([string]$Version, [string]$PayloadHash)

    $entry = Get-ItemProperty -LiteralPath $nsisEntry
    if ($entry.DisplayName -cne $product -or $entry.DisplayVersion -cne $Version -or
        $entry.InstallLocation.Trim('"') -ne $installDirectory -or
        $entry.UninstallString.Trim('"') -ne $uninstaller) {
        throw "The NSIS entry does not match the expected per-user product identity."
    }
    if ((Get-FileHash -LiteralPath $installedApp).Hash -cne $PayloadHash) {
        throw "The installed executable does not match the built NSIS candidate."
    }
    $shell = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcutPath in @($startMenuShortcut, $desktopShortcut)) {
            if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
                throw "The NSIS installer did not recreate the shortcut: $shortcutPath"
            }
            $shortcut = $shell.CreateShortcut($shortcutPath)
            try {
                if ($shortcut.TargetPath -ne $installedApp) {
                    throw "The NSIS shortcut does not point to the installed app: $shortcutPath"
                }
            }
            finally {
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
            }
        }
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
    }
}

function Get-PilotPayloadHash {
    param([string]$InstallerPath, [string]$Label)

    $extractDirectory = Join-Path $env:RUNNER_TEMP "filament-manager-nsis-payload-$Label"
    New-Item -ItemType Directory -Path $extractDirectory | Out-Null
    $sevenZip = (Get-Command "7z.exe" -CommandType Application).Source
    & $sevenZip x "-o$extractDirectory" -y $InstallerPath "-ir!bambu-filament-manager.exe" | Write-Host
    if ($LASTEXITCODE -ne 0) { throw "Could not extract the app payload from the NSIS installer." }
    $payloads = @(Get-ChildItem -LiteralPath $extractDirectory -Recurse -Filter "bambu-filament-manager.exe" -File)
    if ($payloads.Count -ne 1) { throw "Expected exactly one application executable in the NSIS payload." }
    return (Get-FileHash -LiteralPath $payloads[0].FullName).Hash
}

New-Item -ItemType Directory -Path $Logs | Out-Null
Start-Transcript -Path (Join-Path $Logs "pilot-transcript.log")
try {
    Write-Host "Checking the clean per-user installation and library paths for $Scenario."
    Assert-Absent @($defaultInstallDirectory, $installDirectory, $dataDirectory, $roamingDirectory, $nsisEntry, $startMenuShortcut, $desktopShortcut)
    Assert-Autostart $false
    Assert-InstallerPath $false
    if ((Get-MsiState $productCode) -ne -1) { throw "The baseline MSI is already registered." }

    $Installer = (Resolve-Path -LiteralPath $Installer).Path
    $candidateHash = Get-PilotPayloadHash $Installer "initial"
    $sourceMsi = Join-Path $env:RUNNER_TEMP $assetName
    $sourceUri = "https://github.com/bliatun-code/Filament-Manager/releases/download/$SourceVersion/$assetName"
    & curl.exe --fail --location --silent --show-error --retry 3 --max-time 90 --output $sourceMsi $sourceUri
    if ($LASTEXITCODE -ne 0) { throw "The released MSI could not be downloaded." }
    if ((Get-FileHash -LiteralPath $sourceMsi).Hash -ne $source.sha256) {
        throw "The published $SourceVersion MSI did not match its pinned SHA-256."
    }

    $msiLog = Join-Path $Logs "baseline-msi-install.log"
    $msiexec = Join-Path $env:SystemRoot "System32\msiexec.exe"
    Write-Host "Installing the published Filament Manager $SourceVersion MSI."
    $msiArguments = @("/i", ('"{0}"' -f $sourceMsi), "/qn", "/norestart", "/L*V", ('"{0}"' -f $msiLog))
    if ($Scenario -eq "custom-directory") {
        $msiArguments += 'INSTALLDIR="{0}"' -f $installDirectory
    }
    Invoke-PilotInstaller $msiexec $msiArguments
    if ((Get-MsiState $productCode) -ne 5) { throw "Windows Installer did not report the MSI as installed." }
    Assert-InstallerPath $true
    $baselineHash = (Get-FileHash -LiteralPath $installedApp).Hash
    if ($baselineHash -ceq $candidateHash) { throw "The released MSI and candidate must install different binaries." }

    $databaseCheck = Join-Path $PSScriptRoot "windows-nsis-pilot-database.mjs"
    $snapshot = Join-Path $env:RUNNER_TEMP "filament-manager-nsis-library.json"
    if ((Get-FileHash -LiteralPath $Fixture).Hash -ne $FixtureSha256) {
        throw "The fixture does not match the same-run Linux job's SHA-256."
    }
    New-Item -ItemType Directory -Path $dataDirectory | Out-Null
    Copy-Item -LiteralPath $Fixture -Destination $database
    & node $databaseCheck capture $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "Could not capture the expected library state." }
    Test-InstalledApp "MSI" -Legacy
    Set-TestAutostart
    Assert-Autostart $true

    if ($Scenario -eq "custom-directory" -or $Scenario -eq "running-app") {
        $backgroundApp = $null
        try {
            if ($Scenario -eq "running-app") {
                $backgroundApp = Start-Process -FilePath $installedApp -ArgumentList "--background" -WorkingDirectory $installDirectory -PassThru
                if ($backgroundApp.WaitForExit(3000)) { throw "The background app exited before the migration test." }
            }
            Invoke-PilotInstaller $Installer @("/S") -ExpectedExitCode 1
            if ((Get-MsiState $productCode) -ne 5 -or (Get-FileHash -LiteralPath $installedApp).Hash -cne $baselineHash) {
                throw "Refusing migration changed the installed MSI."
            }
            if ($null -ne $backgroundApp -and $backgroundApp.HasExited) {
                throw "Refusing migration stopped the running app."
            }
            Assert-Absent @($nsisEntry, $uninstaller)
            Assert-InstallerPath $true
            Assert-Autostart $true
            & node $databaseCheck verify-legacy $database $snapshot
            if ($LASTEXITCODE -ne 0) { throw "Refusing migration changed the library." }
        }
        finally {
            if ($null -ne $backgroundApp) {
                if (-not $backgroundApp.HasExited) {
                    $backgroundApp.Kill()
                    if (-not $backgroundApp.WaitForExit(15000)) { throw "Could not stop the CI background app before retry." }
                }
                $backgroundApp.Dispose()
            }
        }
    }

    Write-Host "Migrating the installed MSI to the NSIS candidate."
    if ($Scenario -eq "interactive") {
        Invoke-InteractiveInstaller $Installer
    }
    elseif ($Scenario -eq "custom-directory") {
        # NSIS requires /D=... as the final argument and consumes the remainder.
        Invoke-PilotInstaller $Installer @("/S", "/D=$installDirectory")
    }
    else {
        Invoke-PilotInstaller $Installer @("/S")
    }
    if ((Get-MsiState $productCode) -ne -1) { throw "Windows Installer still reports the previous MSI as installed." }
    Assert-CandidateInstalled $ExpectedNsisVersion $candidateHash
    Assert-InstallerPath $false
    Assert-Autostart $true
    Test-InstalledApp "NSIS"

    if ($Scenario -eq "interactive") {
        Write-Host "Updating the existing NSIS installation to $NextVersion through the normal dialog."
        $NextInstaller = (Resolve-Path -LiteralPath $NextInstaller).Path
        $nextHash = Get-PilotPayloadHash $NextInstaller "next"
        if ($nextHash -ceq $candidateHash) { throw "The two NSIS versions must contain distinct executables." }
        Invoke-InteractiveInstaller $NextInstaller
        Assert-CandidateInstalled $NextVersion $nextHash
        Assert-Autostart $true
        Test-InstalledApp "NSIS-update"
        Invoke-PilotInstaller $Installer @("/S") -ExpectedExitCode 1
        Assert-CandidateInstalled $NextVersion $nextHash
        Assert-Autostart $true
        Invoke-InteractiveInstaller $uninstaller
    }
    else {
        Invoke-PilotInstaller $uninstaller @("/S")
    }
    Assert-Absent @($installedApp, $uninstaller, $nsisEntry, $startMenuShortcut, $desktopShortcut, $roamingDirectory)
    Assert-Autostart $false
    & node $databaseCheck verify $database $snapshot
    if ($LASTEXITCODE -ne 0) { throw "NSIS uninstall did not preserve the library." }

    if ($Scenario -eq "interactive") {
        Write-Host "Exercising a clean NSIS installation with the retained library."
        Invoke-PilotInstaller $Installer @("/S")
        Assert-CandidateInstalled $ExpectedNsisVersion $candidateHash
        Assert-Autostart $false
        Test-InstalledApp "NSIS-clean-install"
        Invoke-PilotInstaller $uninstaller @("/S")
        Assert-Absent @($installedApp, $uninstaller, $nsisEntry, $startMenuShortcut, $desktopShortcut, $roamingDirectory)
        & node $databaseCheck verify $database $snapshot
        if ($LASTEXITCODE -ne 0) { throw "Clean NSIS install and uninstall changed the library." }
    }
    Write-Host "Passed the published $SourceVersion MSI to NSIS migration ($Scenario)."
}
finally {
    Stop-Transcript
}
