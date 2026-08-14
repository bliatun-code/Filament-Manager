[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$MsiPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedProductName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedExecutableName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string[]]$ExpectedWindowTitles,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedInstallDirectory,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedAppDataDirectory,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedDatabaseName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$LogDirectory,

    [Parameter(Mandatory = $false)]
    [ValidateSet("UnsignedRequired", "Required")]
    [string]$SignaturePolicy = "UnsignedRequired",

    [Parameter(Mandatory = $false)]
    [string]$ExpectedPublisherSubject = "",

    [Parameter(Mandatory = $false)]
    [ValidateRange(10, 300)]
    [int]$LaunchTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "The Windows MSI smoke test must run on Windows."
}

function Release-ComObject {
    param([AllowNull()][object]$ComObject)

    if ($null -ne $ComObject -and [Runtime.InteropServices.Marshal]::IsComObject($ComObject)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($ComObject)
    }
}

function Get-MsiProperty {
    param(
        [Parameter(Mandatory = $true)][object]$Database,
        [Parameter(Mandatory = $true)][string]$PropertyName
    )

    $escapedPropertyName = $PropertyName.Replace("'", "''")
    $query = "SELECT ``Value`` FROM ``Property`` WHERE ``Property`` = '$escapedPropertyName'"
    $view = $null
    $record = $null

    try {
        $view = $Database.GetType().InvokeMember(
            "OpenView",
            [Reflection.BindingFlags]::InvokeMethod,
            $null,
            $Database,
            @($query)
        )
        [void]$view.GetType().InvokeMember(
            "Execute",
            [Reflection.BindingFlags]::InvokeMethod,
            $null,
            $view,
            $null
        )
        $record = $view.GetType().InvokeMember(
            "Fetch",
            [Reflection.BindingFlags]::InvokeMethod,
            $null,
            $view,
            $null
        )
        if ($null -eq $record) {
            throw "MSI property '$PropertyName' is missing."
        }

        return [string]$record.GetType().InvokeMember(
            "StringData",
            [Reflection.BindingFlags]::GetProperty,
            $null,
            $record,
            @([int]1)
        )
    }
    finally {
        if ($null -ne $view) {
            [void]$view.GetType().InvokeMember(
                "Close",
                [Reflection.BindingFlags]::InvokeMethod,
                $null,
                $view,
                $null
            )
        }
        Release-ComObject $record
        Release-ComObject $view
    }
}

function Get-MsiIdentity {
    param([Parameter(Mandatory = $true)][string]$Path)

    $installer = $null
    $database = $null
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database = $installer.GetType().InvokeMember(
            "OpenDatabase",
            [Reflection.BindingFlags]::InvokeMethod,
            $null,
            $installer,
            @($Path, [int]0)
        )
        return [PSCustomObject]@{
            ProductCode = Get-MsiProperty -Database $database -PropertyName "ProductCode"
            ProductName = Get-MsiProperty -Database $database -PropertyName "ProductName"
        }
    }
    finally {
        Release-ComObject $database
        Release-ComObject $installer
    }
}

function Resolve-SafeLocalAppDataChild {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $trimCharacters = [char[]]@(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $localAppDataRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd($trimCharacters)
    $candidate = [IO.Path]::GetFullPath($Path).TrimEnd($trimCharacters)
    $requiredPrefix = "$localAppDataRoot$([IO.Path]::DirectorySeparatorChar)"
    if (-not $candidate.StartsWith($requiredPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Description must be a child of LOCALAPPDATA: $candidate"
    }
    return $candidate
}

function Get-MsiProductState {
    param([Parameter(Mandatory = $true)][string]$ProductCode)

    # ProductState is independent of the implementation-specific registry hive/view:
    # -1 is unknown, while 5 means installed for the current user.
    $installer = $null
    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        return [int]$installer.GetType().InvokeMember(
            "ProductState",
            [Reflection.BindingFlags]::GetProperty,
            $null,
            $installer,
            @($ProductCode)
        )
    }
    finally {
        Release-ComObject $installer
    }
}

function Assert-UnsignedAuthenticode {
    param([Parameter(Mandatory = $true)][string]$Path)

    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($null -eq $signature) {
        throw "Authenticode inspection returned no result for '$Path'."
    }
    $status = [string]$signature.Status
    if (-not [string]::Equals(
        $status,
        "NotSigned",
        [StringComparison]::Ordinal
    )) {
        throw "Expected an unsigned release artifact, but '$Path' has Authenticode status '$status'."
    }
}

function Test-UserPathContainsDirectory {
    param([Parameter(Mandatory = $true)][string]$Directory)

    $trimCharacters = [char[]]@(
        [IO.Path]::DirectorySeparatorChar,
        [IO.Path]::AltDirectorySeparatorChar
    )
    $expectedDirectory = [IO.Path]::GetFullPath($Directory).TrimEnd($trimCharacters)
    $userPath = [Environment]::GetEnvironmentVariable(
        "Path",
        [EnvironmentVariableTarget]::User
    )
    if ([string]::IsNullOrWhiteSpace($userPath)) {
        return $false
    }
    foreach ($pathSegment in @($userPath -split ";")) {
        $trimmedSegment = $pathSegment.Trim().Trim([char]'"')
        if ([string]::IsNullOrWhiteSpace($trimmedSegment)) {
            continue
        }

        try {
            $expandedSegment = [Environment]::ExpandEnvironmentVariables($trimmedSegment)
            $normalizedSegment = [IO.Path]::GetFullPath($expandedSegment).TrimEnd($trimCharacters)
            if ([string]::Equals(
                $normalizedSegment,
                $expectedDirectory,
                [StringComparison]::OrdinalIgnoreCase
            )) {
                return $true
            }
        }
        catch {
            continue
        }
    }

    return $false
}

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("/i", "/x")][string]$Action,
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][string]$LogPath
    )

    $msiExecPath = Join-Path $env:SystemRoot "System32\msiexec.exe"
    $arguments = @(
        $Action,
        "`"$Target`"",
        "/qn",
        "/norestart",
        "/L*V",
        "`"$LogPath`""
    )
    Write-Host "Running msiexec $Action with verbose logging to $LogPath."
    $msiProcess = Start-Process `
        -FilePath $msiExecPath `
        -ArgumentList $arguments `
        -NoNewWindow `
        -PassThru `
        -Wait
    if ($msiProcess.ExitCode -ne 0) {
        throw "msiexec $Action failed with exit code $($msiProcess.ExitCode). See $LogPath."
    }
}

function Invoke-DatabaseVerification {
    param([Parameter(Mandatory = $true)][string]$DatabasePath)

    $nodeCommand = Get-Command "node.exe" -CommandType Application -ErrorAction Stop |
        Select-Object -First 1
    $databaseVerifier = Join-Path $PSScriptRoot "verify-windows-app-database.mjs"
    $verificationOutput = & $nodeCommand.Source $databaseVerifier --database $DatabasePath 2>&1
    $verificationExitCode = $LASTEXITCODE
    $verificationOutput | ForEach-Object { Write-Host $_ }
    if ($verificationExitCode -ne 0) {
        throw "Database health verification failed with exit code $verificationExitCode."
    }
}

function Test-RegistryValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return $false
    }

    $registryKey = Get-Item -LiteralPath $Path
    try {
        return @($registryKey.GetValueNames()) -contains $Name
    }
    finally {
        $registryKey.Close()
    }
}

function Wait-ForHiddenRunningProcess {
    param(
        [Parameter(Mandatory = $true)][Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][ValidateRange(1, 300)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][ValidateRange(1, 100)][int]$StableCheckCount,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $consecutiveHiddenChecks = 0
    $lastWindowHandle = [IntPtr]::Zero
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "$Description exited unexpectedly with exit code $($Process.ExitCode)."
        }

        $lastWindowHandle = $Process.MainWindowHandle
        if ($lastWindowHandle -eq 0) {
            $consecutiveHiddenChecks++
            if ($consecutiveHiddenChecks -ge $StableCheckCount) {
                return
            }
        }
        else {
            $consecutiveHiddenChecks = 0
        }
    }

    throw "$Description did not remain running without a visible main window within $TimeoutSeconds seconds (last handle=$lastWindowHandle)."
}

$resolvedMsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$msiFile = Get-Item -LiteralPath $resolvedMsiPath
if ($msiFile.Length -le 0) {
    throw "MSI is empty: $resolvedMsiPath"
}

if ([IO.Path]::GetFileName($ExpectedExecutableName) -ne $ExpectedExecutableName) {
    throw "ExpectedExecutableName must be a filename, not a path."
}
if ([IO.Path]::GetExtension($ExpectedExecutableName) -ne ".exe") {
    throw "ExpectedExecutableName must identify an EXE file."
}
if ([IO.Path]::GetFileName($ExpectedDatabaseName) -ne $ExpectedDatabaseName) {
    throw "ExpectedDatabaseName must be a filename, not a path."
}
if (@($ExpectedWindowTitles | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -eq 0) {
    throw "At least one non-empty expected window title is required."
}

$resolvedInstallDirectory = Resolve-SafeLocalAppDataChild `
    -Path $ExpectedInstallDirectory `
    -Description "Install directory"
$resolvedAppDataDirectory = Resolve-SafeLocalAppDataChild `
    -Path $ExpectedAppDataDirectory `
    -Description "App-data directory"
if ([string]::Equals(
    $resolvedInstallDirectory,
    $resolvedAppDataDirectory,
    [StringComparison]::OrdinalIgnoreCase
)) {
    throw "Install and app-data directories must be different."
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$resolvedLogDirectory = (Resolve-Path -LiteralPath $LogDirectory).Path
$transcriptPath = Join-Path $resolvedLogDirectory "smoke-transcript.log"
$installLogPath = Join-Path $resolvedLogDirectory "msi-install.log"
$uninstallLogPath = Join-Path $resolvedLogDirectory "msi-uninstall.log"
$cleanupLogPath = Join-Path $resolvedLogDirectory "msi-cleanup.log"
$appStdoutPath = Join-Path $resolvedLogDirectory "app-stdout.log"
$appStderrPath = Join-Path $resolvedLogDirectory "app-stderr.log"
$backgroundAppStdoutPath = Join-Path $resolvedLogDirectory "app-background-stdout.log"
$backgroundAppStderrPath = Join-Path $resolvedLogDirectory "app-background-stderr.log"
$secondaryAppStdoutPath = Join-Path $resolvedLogDirectory "app-secondary-stdout.log"
$secondaryAppStderrPath = Join-Path $resolvedLogDirectory "app-secondary-stderr.log"
$summaryPath = Join-Path $resolvedLogDirectory "smoke-summary.txt"
$desktopDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$programsDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
if ([string]::IsNullOrWhiteSpace($desktopDirectory) -or [string]::IsNullOrWhiteSpace($programsDirectory)) {
    throw "Windows Desktop and Start Menu directories must be available for the installer smoke test."
}
$desktopShortcutPath = Join-Path $desktopDirectory "$ExpectedProductName.lnk"
$startMenuProductDirectory = Join-Path $programsDirectory $ExpectedProductName
$startMenuShortcutPath = Join-Path $startMenuProductDirectory "$ExpectedProductName.lnk"
$desktopLifecyclePreferencesPath = Join-Path $resolvedAppDataDirectory "desktop-lifecycle.json"
$runRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$startupApprovedRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
$stableAutostartValueName = "no.bliatun.filamentmanager"
$legacyAutostartValueName = "Filament Manager"
$runSmokeValue = '"C:\filament-manager-smoke\missing.exe" --background'
$startupApprovedSmokeValue = [byte[]]@(
    0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
)
$autostartRegistryTargets = @(
    [PSCustomObject]@{
        Path = $runRegistryPath
        Name = $stableAutostartValueName
        PropertyType = "String"
        Value = $runSmokeValue
    },
    [PSCustomObject]@{
        Path = $startupApprovedRegistryPath
        Name = $stableAutostartValueName
        PropertyType = "Binary"
        Value = $startupApprovedSmokeValue
    },
    [PSCustomObject]@{
        Path = $runRegistryPath
        Name = $legacyAutostartValueName
        PropertyType = "String"
        Value = $runSmokeValue
    },
    [PSCustomObject]@{
        Path = $startupApprovedRegistryPath
        Name = $legacyAutostartValueName
        PropertyType = "Binary"
        Value = $startupApprovedSmokeValue
    }
)

$transcriptStarted = $false
$installationAttempted = $false
$uninstallSucceeded = $false
$canRemoveSmokeAppData = $false
$appProcess = $null
$secondaryProcess = $null
$productCode = $null
$createdAutostartRegistryKeys = @()
$seededAutostartRegistryTargets = @()

try {
    Start-Transcript -LiteralPath $transcriptPath -Force | Out-Null
    $transcriptStarted = $true

    if (Test-Path -LiteralPath $resolvedInstallDirectory) {
        throw "Clean-install precondition failed; install directory already exists: $resolvedInstallDirectory"
    }
    if (Test-Path -LiteralPath $resolvedAppDataDirectory) {
        throw "Clean-install precondition failed; app-data directory already exists: $resolvedAppDataDirectory"
    }
    if (Test-Path -LiteralPath $desktopShortcutPath) {
        throw "Clean-install precondition failed; Desktop shortcut already exists: $desktopShortcutPath"
    }
    if (Test-Path -LiteralPath $startMenuProductDirectory) {
        throw "Clean-install precondition failed; Start Menu product directory already exists: $startMenuProductDirectory"
    }
    if (Test-UserPathContainsDirectory -Directory $resolvedInstallDirectory) {
        throw "Clean-install precondition failed; the user PATH already contains the install directory."
    }
    $canRemoveSmokeAppData = $true

    $executableBaseName = [IO.Path]::GetFileNameWithoutExtension($ExpectedExecutableName)
    $existingProcesses = @(Get-Process -Name $executableBaseName -ErrorAction SilentlyContinue)
    if ($existingProcesses.Count -ne 0) {
        throw "Clean-install precondition failed; $ExpectedExecutableName is already running."
    }

    foreach ($registryTarget in $autostartRegistryTargets) {
        if (Test-RegistryValue -Path $registryTarget.Path -Name $registryTarget.Name) {
            throw "Autostart smoke precondition failed; registry value '$($registryTarget.Name)' already exists at '$($registryTarget.Path)'."
        }
    }

    $msiIdentity = Get-MsiIdentity -Path $resolvedMsiPath
    if (-not [string]::Equals(
        $msiIdentity.ProductName,
        $ExpectedProductName,
        [StringComparison]::Ordinal
    )) {
        throw "MSI ProductName mismatch: expected '$ExpectedProductName', found '$($msiIdentity.ProductName)'."
    }
    if ($msiIdentity.ProductCode -notmatch '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$') {
        throw "MSI ProductCode is invalid: $($msiIdentity.ProductCode)"
    }
    $productCode = $msiIdentity.ProductCode
    $initialProductState = Get-MsiProductState -ProductCode $productCode
    if ($initialProductState -ne -1) {
        throw "Clean-install precondition failed; Windows Installer already reports product state $initialProductState for $productCode."
    }

    if ($SignaturePolicy -eq "UnsignedRequired") {
        Assert-UnsignedAuthenticode -Path $resolvedMsiPath
    }
    elseif ($SignaturePolicy -eq "Required") {
        if ([string]::IsNullOrWhiteSpace($ExpectedPublisherSubject)) {
            throw "ExpectedPublisherSubject is required when SignaturePolicy is Required."
        }
        & (Join-Path $PSScriptRoot "verify-windows-authenticode.ps1") `
            -FilePath $resolvedMsiPath `
            -ExpectedPublisherSubject $ExpectedPublisherSubject
    }

    $installationAttempted = $true
    Invoke-MsiExec -Action "/i" -Target $resolvedMsiPath -LogPath $installLogPath

    $installedExecutablePath = Join-Path $resolvedInstallDirectory $ExpectedExecutableName
    if (-not (Test-Path -LiteralPath $installedExecutablePath -PathType Leaf)) {
        throw "Installed executable was not found: $installedExecutablePath"
    }
    $installedProductState = Get-MsiProductState -ProductCode $productCode
    if ($installedProductState -ne 5) {
        throw "Install did not register $productCode for the current user; expected Windows Installer product state 5, found $installedProductState."
    }
    if (-not (Test-Path -LiteralPath $desktopShortcutPath -PathType Leaf)) {
        throw "Install did not create the expected Desktop shortcut: $desktopShortcutPath"
    }
    if (-not (Test-Path -LiteralPath $startMenuShortcutPath -PathType Leaf)) {
        throw "Install did not create the expected Start Menu shortcut: $startMenuShortcutPath"
    }
    if (-not (Test-UserPathContainsDirectory -Directory $resolvedInstallDirectory)) {
        throw "Install did not add the install directory to the user PATH."
    }
    if ($SignaturePolicy -eq "UnsignedRequired") {
        Assert-UnsignedAuthenticode -Path $installedExecutablePath
    }
    elseif ($SignaturePolicy -eq "Required") {
        & (Join-Path $PSScriptRoot "verify-windows-authenticode.ps1") `
            -FilePath $installedExecutablePath `
            -ExpectedPublisherSubject $ExpectedPublisherSubject
    }

    $appProcess = Start-Process `
        -FilePath $installedExecutablePath `
        -WorkingDirectory $resolvedInstallDirectory `
        -RedirectStandardOutput $appStdoutPath `
        -RedirectStandardError $appStderrPath `
        -PassThru

    $databasePath = Join-Path $resolvedAppDataDirectory $ExpectedDatabaseName
    $launchDeadline = [DateTime]::UtcNow.AddSeconds($LaunchTimeoutSeconds)
    $windowReady = $false
    $databaseReady = $false
    $observedTitle = ""
    while ([DateTime]::UtcNow -lt $launchDeadline) {
        Start-Sleep -Milliseconds 500
        $appProcess.Refresh()
        if ($appProcess.HasExited) {
            throw "Installed app exited before becoming ready with exit code $($appProcess.ExitCode)."
        }

        $observedTitle = $appProcess.MainWindowTitle
        $titleMatches = $ExpectedWindowTitles -contains $observedTitle
        $windowReady = $appProcess.MainWindowHandle -ne 0 -and $appProcess.Responding -and $titleMatches
        $databaseReady = Test-Path -LiteralPath $databasePath -PathType Leaf
        if ($windowReady -and $databaseReady) {
            break
        }
    }
    if (-not $windowReady -or -not $databaseReady) {
        throw "App did not become ready within $LaunchTimeoutSeconds seconds (title='$observedTitle', windowReady=$windowReady, databaseReady=$databaseReady)."
    }

    Invoke-DatabaseVerification -DatabasePath $databasePath

    if (-not $appProcess.CloseMainWindow()) {
        throw "The app did not accept a normal main-window close request."
    }
    if (-not $appProcess.WaitForExit(15000)) {
        throw "The app did not exit within 15 seconds after a normal close request."
    }
    if ($appProcess.ExitCode -ne 0) {
        throw "The app exited with code $($appProcess.ExitCode) after a normal close request."
    }
    $appProcess = $null

    if (Test-Path -LiteralPath $desktopLifecyclePreferencesPath) {
        throw "Default lifecycle smoke unexpectedly created a desktop lifecycle preferences file: $desktopLifecyclePreferencesPath"
    }
    $desktopLifecyclePreferencesJson = "{`"continue_in_background`":true}$([Environment]::NewLine)"
    [IO.File]::WriteAllText(
        $desktopLifecyclePreferencesPath,
        $desktopLifecyclePreferencesJson,
        [Text.UTF8Encoding]::new($false)
    )

    $appProcess = Start-Process `
        -FilePath $installedExecutablePath `
        -ArgumentList "--background" `
        -WorkingDirectory $resolvedInstallDirectory `
        -RedirectStandardOutput $backgroundAppStdoutPath `
        -RedirectStandardError $backgroundAppStderrPath `
        -PassThru
    $backgroundPrimaryProcessId = $appProcess.Id

    Wait-ForHiddenRunningProcess `
        -Process $appProcess `
        -TimeoutSeconds $LaunchTimeoutSeconds `
        -StableCheckCount 6 `
        -Description "Background launch"

    $secondaryProcess = Start-Process `
        -FilePath $installedExecutablePath `
        -WorkingDirectory $resolvedInstallDirectory `
        -RedirectStandardOutput $secondaryAppStdoutPath `
        -RedirectStandardError $secondaryAppStderrPath `
        -PassThru
    if (-not $secondaryProcess.WaitForExit(15000)) {
        throw "The normal secondary instance did not exit within 15 seconds."
    }
    if ($secondaryProcess.ExitCode -ne 0) {
        throw "The normal secondary instance exited with code $($secondaryProcess.ExitCode)."
    }
    $secondaryProcess = $null

    $restoreDeadline = [DateTime]::UtcNow.AddSeconds($LaunchTimeoutSeconds)
    $restoredWindowReady = $false
    while ([DateTime]::UtcNow -lt $restoreDeadline) {
        Start-Sleep -Milliseconds 500
        $appProcess.Refresh()
        if ($appProcess.HasExited) {
            throw "The background primary process exited while the secondary instance requested its window."
        }

        $observedTitle = $appProcess.MainWindowTitle
        $titleMatches = $ExpectedWindowTitles -contains $observedTitle
        $restoredWindowReady = `
            $appProcess.MainWindowHandle -ne 0 -and `
            $appProcess.Responding -and `
            $titleMatches
        if ($restoredWindowReady) {
            break
        }
    }
    if (-not $restoredWindowReady) {
        throw "The normal secondary instance did not restore the primary window within $LaunchTimeoutSeconds seconds (primaryPid=$backgroundPrimaryProcessId, title='$observedTitle')."
    }

    $matchingProcesses = @(Get-Process -Name $executableBaseName -ErrorAction SilentlyContinue)
    if ($matchingProcesses.Count -ne 1) {
        throw "Expected one app process after the secondary instance exited, but found $($matchingProcesses.Count)."
    }
    if ($matchingProcesses[0].Id -ne $backgroundPrimaryProcessId) {
        throw "The restored window belongs to PID $($matchingProcesses[0].Id), not the original background primary PID $backgroundPrimaryProcessId."
    }

    if (-not $appProcess.CloseMainWindow()) {
        throw "The background-enabled app did not accept a main-window close request."
    }
    Wait-ForHiddenRunningProcess `
        -Process $appProcess `
        -TimeoutSeconds 15 `
        -StableCheckCount 6 `
        -Description "Close-to-tray primary process"
    $samePrimaryAfterClose = Get-Process -Id $backgroundPrimaryProcessId -ErrorAction Stop
    if ($samePrimaryAfterClose.Id -ne $appProcess.Id) {
        throw "Close-to-tray did not retain the original primary process."
    }

    Stop-Process -Id $backgroundPrimaryProcessId -Force -ErrorAction Stop
    if (-not $appProcess.WaitForExit(15000)) {
        throw "The background primary process did not stop during test cleanup."
    }
    $appProcess = $null

    foreach ($registryTarget in $autostartRegistryTargets) {
        if (Test-RegistryValue -Path $registryTarget.Path -Name $registryTarget.Name) {
            throw "Autostart smoke precondition failed immediately before seeding; registry value '$($registryTarget.Name)' now exists at '$($registryTarget.Path)'."
        }
    }
    foreach ($registryPath in @($runRegistryPath, $startupApprovedRegistryPath)) {
        if (-not (Test-Path -LiteralPath $registryPath -PathType Container)) {
            New-Item -Path $registryPath -Force | Out-Null
            $createdAutostartRegistryKeys += $registryPath
        }
    }
    foreach ($registryTarget in $autostartRegistryTargets) {
        New-ItemProperty `
            -LiteralPath $registryTarget.Path `
            -Name $registryTarget.Name `
            -PropertyType $registryTarget.PropertyType `
            -Value $registryTarget.Value | Out-Null
        $seededAutostartRegistryTargets += $registryTarget
    }

    $databaseHashBeforeUninstall = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
    Invoke-MsiExec -Action "/x" -Target $productCode -LogPath $uninstallLogPath
    $uninstallSucceeded = $true

    if (Test-Path -LiteralPath $installedExecutablePath) {
        throw "Uninstall left the installed executable behind: $installedExecutablePath"
    }
    if (Test-Path -LiteralPath $resolvedInstallDirectory) {
        throw "Uninstall left the install directory behind: $resolvedInstallDirectory"
    }
    $uninstalledProductState = Get-MsiProductState -ProductCode $productCode
    if ($uninstalledProductState -ne -1) {
        throw "Uninstall left Windows Installer product state $uninstalledProductState behind for $productCode."
    }
    if (Test-Path -LiteralPath $desktopShortcutPath) {
        throw "Uninstall left the Desktop shortcut behind: $desktopShortcutPath"
    }
    if (Test-Path -LiteralPath $startMenuShortcutPath) {
        throw "Uninstall left the Start Menu shortcut behind: $startMenuShortcutPath"
    }
    if (Test-Path -LiteralPath $startMenuProductDirectory) {
        throw "Uninstall left the Start Menu product directory behind: $startMenuProductDirectory"
    }
    if (Test-UserPathContainsDirectory -Directory $resolvedInstallDirectory) {
        throw "Uninstall left the install directory in the user PATH."
    }
    foreach ($registryTarget in $autostartRegistryTargets) {
        if (Test-RegistryValue -Path $registryTarget.Path -Name $registryTarget.Name) {
            throw "Uninstall left app-owned autostart registry value '$($registryTarget.Name)' behind at '$($registryTarget.Path)'."
        }
    }
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
        throw "Uninstall removed the user database instead of retaining it: $databasePath"
    }

    $databaseHashAfterUninstall = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
    if (-not [string]::Equals(
        $databaseHashAfterUninstall,
        $databaseHashBeforeUninstall,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "The retained database changed during uninstall."
    }
    Invoke-DatabaseVerification -DatabasePath $databasePath

    $summary = @(
        "MSI: $resolvedMsiPath",
        "Product: $($msiIdentity.ProductName)",
        "ProductCode: $productCode",
        "Executable: $installedExecutablePath",
        "Observed window title: $observedTitle",
        "Database: $databasePath",
        "Database SHA-256 retained: $($databaseHashAfterUninstall.ToLowerInvariant())",
        "Default close exited cleanly: yes",
        "Background launch stayed hidden: yes",
        "Single-instance window restore retained PID: $backgroundPrimaryProcessId",
        "Close-to-tray kept the primary process alive: yes",
        "Stable and legacy autostart registry values removed: yes",
        "Windows Installer current-user registration removed: yes",
        "Desktop and Start Menu shortcuts removed: yes",
        "User PATH entry removed: yes",
        "Signature policy: $SignaturePolicy",
        "Result: PASS"
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText($summaryPath, "$summary$([Environment]::NewLine)")
    Write-Host "Windows MSI clean install, desktop lifecycle, database, retention and uninstall smoke passed."
}
finally {
    $applicationStoppedForCleanup = $true
    foreach ($processToStop in @($secondaryProcess, $appProcess)) {
        if ($null -eq $processToStop) {
            continue
        }

        try {
            if (-not $processToStop.HasExited) {
                Stop-Process -Id $processToStop.Id -Force -ErrorAction Stop
                $processToStop.WaitForExit()
            }
        }
        catch {
            $applicationStoppedForCleanup = $false
            Write-Warning "Failed to stop app process $($processToStop.Id) during smoke cleanup: $($_.Exception.Message)"
        }
    }

    if (
        $applicationStoppedForCleanup -and
        $installationAttempted -and
        -not $uninstallSucceeded -and
        $null -ne $productCode
    ) {
        try {
            Invoke-MsiExec -Action "/x" -Target $productCode -LogPath $cleanupLogPath
        }
        catch {
            Write-Warning "Failed to uninstall the app during smoke cleanup: $($_.Exception.Message)"
        }
    }

    foreach ($registryTarget in $seededAutostartRegistryTargets) {
        try {
            if (Test-RegistryValue -Path $registryTarget.Path -Name $registryTarget.Name) {
                Remove-ItemProperty `
                    -LiteralPath $registryTarget.Path `
                    -Name $registryTarget.Name `
                    -Force `
                    -ErrorAction Stop
            }
        }
        catch {
            Write-Warning "Failed to remove smoke-owned registry value '$($registryTarget.Name)' from '$($registryTarget.Path)': $($_.Exception.Message)"
        }
    }

    foreach ($registryPath in $createdAutostartRegistryKeys) {
        try {
            if (-not (Test-Path -LiteralPath $registryPath -PathType Container)) {
                continue
            }

            $registryKey = Get-Item -LiteralPath $registryPath
            try {
                $registryKeyIsEmpty = `
                    @($registryKey.GetValueNames()).Count -eq 0 -and `
                    @($registryKey.GetSubKeyNames()).Count -eq 0
            }
            finally {
                $registryKey.Close()
            }
            if ($registryKeyIsEmpty) {
                Remove-Item -LiteralPath $registryPath -Force -ErrorAction Stop
            }
        }
        catch {
            Write-Warning "Failed to remove an empty smoke-created registry key '$registryPath': $($_.Exception.Message)"
        }
    }

    if (
        $applicationStoppedForCleanup -and
        $canRemoveSmokeAppData -and
        (Test-Path -LiteralPath $resolvedAppDataDirectory)
    ) {
        try {
            Remove-Item -LiteralPath $resolvedAppDataDirectory -Recurse -Force -ErrorAction Stop
            Write-Host "Removed smoke-test app data after the retention assertion."
        }
        catch {
            Write-Warning "Failed to remove smoke-test app data: $($_.Exception.Message)"
        }
    }

    if ($transcriptStarted) {
        try {
            Stop-Transcript | Out-Null
        }
        catch {
            Write-Warning "Failed to close the smoke transcript: $($_.Exception.Message)"
        }
    }
}
