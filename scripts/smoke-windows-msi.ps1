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
$summaryPath = Join-Path $resolvedLogDirectory "smoke-summary.txt"
$desktopDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$programsDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)
if ([string]::IsNullOrWhiteSpace($desktopDirectory) -or [string]::IsNullOrWhiteSpace($programsDirectory)) {
    throw "Windows Desktop and Start Menu directories must be available for the installer smoke test."
}
$desktopShortcutPath = Join-Path $desktopDirectory "$ExpectedProductName.lnk"
$startMenuProductDirectory = Join-Path $programsDirectory $ExpectedProductName
$startMenuShortcutPath = Join-Path $startMenuProductDirectory "$ExpectedProductName.lnk"

$transcriptStarted = $false
$installationAttempted = $false
$uninstallSucceeded = $false
$canRemoveSmokeAppData = $false
$appProcess = $null
$productCode = $null

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
        "Windows Installer current-user registration removed: yes",
        "Desktop and Start Menu shortcuts removed: yes",
        "User PATH entry removed: yes",
        "Signature policy: $SignaturePolicy",
        "Result: PASS"
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText($summaryPath, "$summary$([Environment]::NewLine)")
    Write-Host "Windows MSI clean install, launch, database, retention and uninstall smoke passed."
}
finally {
    $applicationStoppedForCleanup = $true
    if ($null -ne $appProcess) {
        try {
            if (-not $appProcess.HasExited) {
                Stop-Process -Id $appProcess.Id -Force -ErrorAction Stop
                $appProcess.WaitForExit()
            }
        }
        catch {
            $applicationStoppedForCleanup = $false
            Write-Warning "Failed to stop the app during smoke cleanup: $($_.Exception.Message)"
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
