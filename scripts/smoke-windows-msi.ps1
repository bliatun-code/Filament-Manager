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
    [string]$UpgradeFixturePath = "",

    [Parameter(Mandatory = $false)]
    [string]$UpgradeSourceRelease = "",

    [Parameter(Mandatory = $false)]
    [switch]$RunPackagedDesktopE2E,

    [Parameter(Mandatory = $false)]
    [switch]$RunPackagedHostClientE2E,

    [Parameter(Mandatory = $false)]
    [ValidateRange(10, 300)]
    [int]$LaunchTimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "The Windows MSI smoke test must run on Windows."
}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class FilamentManagerWindowInspector
{
    private const int GwlExStyle = -20;
    private const long WsExToolWindow = 0x00000080L;
    private const long WsExLayered = 0x00080000L;
    private const long WsExNoActivate = 0x08000000L;
    private const int DwmwaCloaked = 14;
    private const uint WmClose = 0x0010;

    private delegate bool EnumWindowsProc(IntPtr windowHandle, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public sealed class WindowInfo
    {
        public IntPtr Handle { get; set; }
        public uint ProcessId { get; set; }
        public string Title { get; set; }
        public string ClassName { get; set; }
        public bool IsVisible { get; set; }
        public bool IsToolWindow { get; set; }
        public bool IsLayered { get; set; }
        public bool IsNoActivate { get; set; }
        public bool IsCloaked { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public long ExtendedStyle { get; set; }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextLengthW(IntPtr windowHandle);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextW(
        IntPtr windowHandle,
        StringBuilder text,
        int maximumCharacters
    );

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetClassNameW(
        IntPtr windowHandle,
        StringBuilder className,
        int maximumCharacters
    );

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr windowHandle);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr windowHandle, int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr32(IntPtr windowHandle, int index);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr windowHandle, out Rect rectangle);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr windowHandle,
        int attribute,
        out int value,
        int valueSize
    );

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool PostMessageW(
        IntPtr windowHandle,
        uint message,
        IntPtr wordParameter,
        IntPtr longParameter
    );

    public static WindowInfo[] GetWindowsForProcess(int processId)
    {
        List<WindowInfo> windows = new List<WindowInfo>();
        EnumWindowsProc callback = delegate(IntPtr windowHandle, IntPtr parameter)
        {
            uint windowProcessId;
            GetWindowThreadProcessId(windowHandle, out windowProcessId);
            if (windowProcessId != (uint)processId)
            {
                return true;
            }

            long extendedStyle = GetWindowLongPtr(windowHandle, GwlExStyle).ToInt64();
            Rect rectangle;
            int width = 0;
            int height = 0;
            if (GetWindowRect(windowHandle, out rectangle))
            {
                width = Math.Max(0, rectangle.Right - rectangle.Left);
                height = Math.Max(0, rectangle.Bottom - rectangle.Top);
            }

            int cloaked = 0;
            bool isCloaked = DwmGetWindowAttribute(
                windowHandle,
                DwmwaCloaked,
                out cloaked,
                Marshal.SizeOf(typeof(int))
            ) == 0 && cloaked != 0;

            windows.Add(new WindowInfo
            {
                Handle = windowHandle,
                ProcessId = windowProcessId,
                Title = ReadWindowTitle(windowHandle),
                ClassName = ReadWindowClassName(windowHandle),
                IsVisible = IsWindowVisible(windowHandle),
                IsToolWindow = (extendedStyle & WsExToolWindow) != 0,
                IsLayered = (extendedStyle & WsExLayered) != 0,
                IsNoActivate = (extendedStyle & WsExNoActivate) != 0,
                IsCloaked = isCloaked,
                Width = width,
                Height = height,
                ExtendedStyle = extendedStyle
            });
            return true;
        };

        if (!EnumWindows(callback, IntPtr.Zero))
        {
            throw new InvalidOperationException(
                "EnumWindows failed with Win32 error " + Marshal.GetLastWin32Error() + "."
            );
        }
        return windows.ToArray();
    }

    public static bool RequestClose(IntPtr windowHandle)
    {
        return PostMessageW(windowHandle, WmClose, IntPtr.Zero, IntPtr.Zero);
    }

    private static IntPtr GetWindowLongPtr(IntPtr windowHandle, int index)
    {
        return IntPtr.Size == 8
            ? GetWindowLongPtr64(windowHandle, index)
            : GetWindowLongPtr32(windowHandle, index);
    }

    private static string ReadWindowTitle(IntPtr windowHandle)
    {
        int length = GetWindowTextLengthW(windowHandle);
        if (length <= 0)
        {
            return string.Empty;
        }
        StringBuilder title = new StringBuilder(length + 1);
        GetWindowTextW(windowHandle, title, title.Capacity);
        return title.ToString();
    }

    private static string ReadWindowClassName(IntPtr windowHandle)
    {
        StringBuilder className = new StringBuilder(256);
        GetClassNameW(windowHandle, className, className.Capacity);
        return className.ToString();
    }
}
'@

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

function Get-ProcessWindowSnapshot {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    return @([FilamentManagerWindowInspector]::GetWindowsForProcess($ProcessId))
}

function Get-VisibleUserFacingWindows {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    return @(
        Get-ProcessWindowSnapshot -ProcessId $ProcessId |
            Where-Object {
                $_.IsVisible -and
                -not $_.IsToolWindow -and
                -not $_.IsCloaked -and
                $_.Width -gt 0 -and
                $_.Height -gt 0
            }
    )
}

function Get-VisibleExpectedAppWindows {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string[]]$ExpectedTitles
    )

    return @(
        Get-VisibleUserFacingWindows -ProcessId $ProcessId |
            Where-Object { $ExpectedTitles -contains $_.Title }
    )
}

function Format-ProcessWindowSnapshot {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    $windows = @(Get-ProcessWindowSnapshot -ProcessId $ProcessId)
    if ($windows.Count -eq 0) {
        return "<none>"
    }
    $windowDescriptions = @(
        $windows | ForEach-Object {
            $handle = "0x$($_.Handle.ToInt64().ToString('X'))"
            "$handle title='$($_.Title)' class='$($_.ClassName)' visible=$($_.IsVisible) tool=$($_.IsToolWindow) layered=$($_.IsLayered) noActivate=$($_.IsNoActivate) cloaked=$($_.IsCloaked) size=$($_.Width)x$($_.Height) exStyle=0x$($_.ExtendedStyle.ToString('X'))"
        }
    )
    return $windowDescriptions -join "; "
}

function Request-AppWindowClose {
    param(
        [Parameter(Mandatory = $true)][object]$Window,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not [FilamentManagerWindowInspector]::RequestClose($Window.Handle)) {
        $win32Error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "$Description did not accept WM_CLOSE (handle=$($Window.Handle), Win32 error=$win32Error)."
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
    $lastWindowSnapshot = "<not inspected>"
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "$Description exited unexpectedly with exit code $($Process.ExitCode)."
        }

        $visibleAppWindows = @(
            Get-VisibleUserFacingWindows -ProcessId $Process.Id
        )
        if ($visibleAppWindows.Count -eq 0) {
            $consecutiveHiddenChecks++
            if ($consecutiveHiddenChecks -ge $StableCheckCount) {
                return
            }
        }
        else {
            $consecutiveHiddenChecks = 0
        }
        $lastWindowSnapshot = Format-ProcessWindowSnapshot -ProcessId $Process.Id
    }

    throw "$Description did not remain running without a visible app window within $TimeoutSeconds seconds. Last top-level windows: $lastWindowSnapshot"
}

function Get-ProcessesForExactExecutable {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)

    $expectedPath = [IO.Path]::GetFullPath($ExecutablePath)
    $executableName = [IO.Path]::GetFileName($expectedPath)
    $escapedExecutableName = $executableName.Replace("'", "''")
    $candidates = @(
        Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "Name = '$escapedExecutableName'" `
            -ErrorAction Stop
    )

    return @(
        $candidates | Where-Object {
            -not [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -and
            [string]::Equals(
                [IO.Path]::GetFullPath([string]$_.ExecutablePath),
                $expectedPath,
                [StringComparison]::OrdinalIgnoreCase
            )
        }
    )
}

function Stop-ProcessesForExactExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 30)]
        [int]$TimeoutSeconds = 5
    )

    $expectedPath = [IO.Path]::GetFullPath($ExecutablePath)
    $matchingProcesses = @(Get-ProcessesForExactExecutable -ExecutablePath $expectedPath)
    foreach ($matchingProcess in $matchingProcesses) {
        $processId = [int]$matchingProcess.ProcessId
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            continue
        }

        try {
            $liveProcessPath = [IO.Path]::GetFullPath([string]$process.Path)
            if (-not [string]::Equals(
                $liveProcessPath,
                $expectedPath,
                [StringComparison]::OrdinalIgnoreCase
            )) {
                throw "PID $processId no longer belongs to the expected installed executable."
            }

            Stop-Process -InputObject $process -Force -ErrorAction Stop
            if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
                throw "Process $processId did not stop within $TimeoutSeconds seconds."
            }
        }
        finally {
            $process.Dispose()
        }
    }

    $remainingProcesses = @(Get-ProcessesForExactExecutable -ExecutablePath $expectedPath)
    if ($remainingProcesses.Count -ne 0) {
        $remainingProcessIds = @($remainingProcesses | ForEach-Object { $_.ProcessId }) -join ", "
        throw "Installed executable still has running processes after bounded cleanup: $remainingProcessIds"
    }

    return $matchingProcesses.Count
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

function New-PrivateQaDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (Test-Path -LiteralPath $Path) {
        throw "$Description must not exist before it is created: $Path"
    }
    New-Item -ItemType Directory -Path $Path -ErrorAction Stop | Out-Null
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $currentUserSid) {
        throw "Could not resolve the current Windows user SID for $Description."
    }
    $accessRule = [Security.AccessControl.FileSystemAccessRule]::new(
        $currentUserSid,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit",
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $accessControl = [Security.AccessControl.DirectorySecurity]::new()
    $accessControl.SetOwner($currentUserSid)
    $accessControl.SetAccessRuleProtection($true, $false)
    [void]$accessControl.AddAccessRule($accessRule)
    Set-Acl -LiteralPath $resolvedPath -AclObject $accessControl -ErrorAction Stop

    $verifiedAccessControl = Get-Acl -LiteralPath $resolvedPath
    if (-not $verifiedAccessControl.AreAccessRulesProtected) {
        throw "$Description does not have protected private ACL inheritance."
    }
    $currentUserRules = @(
        $verifiedAccessControl.Access |
            Where-Object {
                $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]) -eq
                    $currentUserSid -and
                $_.AccessControlType -eq
                    [Security.AccessControl.AccessControlType]::Allow -and
                ($_.FileSystemRights -band
                    [Security.AccessControl.FileSystemRights]::FullControl) -eq
                    [Security.AccessControl.FileSystemRights]::FullControl
            }
    )
    if ($currentUserRules.Count -ne 1) {
        throw "$Description does not grant exactly one full-control rule to the current user."
    }
    return $resolvedPath
}
if (
    [string]::IsNullOrWhiteSpace($UpgradeFixturePath) -ne
    [string]::IsNullOrWhiteSpace($UpgradeSourceRelease)
) {
    throw "UpgradeFixturePath and UpgradeSourceRelease must be provided together."
}
$resolvedUpgradeFixturePath = ""
if (-not [string]::IsNullOrWhiteSpace($UpgradeFixturePath)) {
    $resolvedUpgradeFixturePath = (Resolve-Path -LiteralPath $UpgradeFixturePath).Path
    if (-not (Test-Path -LiteralPath $resolvedUpgradeFixturePath -PathType Leaf)) {
        throw "Previous-release upgrade fixture is not a file: $resolvedUpgradeFixturePath"
    }
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
$previousReleaseDatabaseGateSummary = "not requested"
$packagedDesktopE2eSummary = "not requested"
$packagedDesktopE2eWorkParent = $null
$packagedHostClientE2eSummary = "not requested"
$packagedHostClientE2eWorkParent = $null
$packagedHostClientE2eWorkDirectory = $null
$packagedHostClientE2eLogDirectory = $null
$packagedHostClientE2eRunner = $null
$packagedHostClientE2eRunId = $null
$installedExecutablePath = $null
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

    if (-not [string]::IsNullOrWhiteSpace($resolvedUpgradeFixturePath)) {
        $nodeCommand = Get-Command "node.exe" -CommandType Application -ErrorAction Stop |
            Select-Object -First 1
        $databaseUpgradeSmoke = Join-Path $PSScriptRoot "smoke-release-database-upgrade.mjs"
        $databaseUpgradeLogDirectory = Join-Path $resolvedLogDirectory "database-compatibility"
        $upgradeSmokeArguments = @(
            $databaseUpgradeSmoke,
            "--database=$resolvedUpgradeFixturePath",
            "--executable=$installedExecutablePath",
            "--log-dir=$databaseUpgradeLogDirectory",
            "--launch-timeout-ms=$($LaunchTimeoutSeconds * 1000)",
            "--database-readiness-only",
            "--allow-current-schema",
            "--source-release=$UpgradeSourceRelease"
        )
        $upgradeSmokeOutput = & $nodeCommand.Source @upgradeSmokeArguments 2>&1
        $upgradeSmokeExitCode = $LASTEXITCODE
        $upgradeSmokeOutput | ForEach-Object { Write-Host $_ }
        if ($upgradeSmokeExitCode -ne 0) {
            throw "Installed MSI database compatibility smoke failed with exit code $upgradeSmokeExitCode."
        }
        $previousReleaseDatabaseGateSummary = "$UpgradeSourceRelease, two installed-binary launches"
    }

    if ($RunPackagedDesktopE2E) {
        $nodeCommand = Get-Command "node.exe" -CommandType Application -ErrorAction Stop |
            Select-Object -First 1
        $packagedDesktopE2eRunner = Join-Path $PSScriptRoot "run-packaged-desktop-e2e.mjs"
        $packagedDesktopE2eWorkParent = New-PrivateQaDirectory `
            -Path (Join-Path ([IO.Path]::GetTempPath()) "filament-manager-packaged-desktop-e2e-$([Guid]::NewGuid().ToString('N'))") `
            -Description "Packaged desktop E2E work parent"
        $packagedDesktopE2eLogParent = New-PrivateQaDirectory `
            -Path (Join-Path $resolvedLogDirectory "packaged-desktop-e2e-private") `
            -Description "Packaged desktop E2E log parent"
        $packagedDesktopE2eWorkDirectory = Join-Path $packagedDesktopE2eWorkParent "work"
        $packagedDesktopE2eLogDirectory = Join-Path $packagedDesktopE2eLogParent "logs"
        $packagedDesktopE2eArguments = @(
            $packagedDesktopE2eRunner,
            "--executable=$installedExecutablePath",
            "--work-dir=$packagedDesktopE2eWorkDirectory",
            "--log-dir=$packagedDesktopE2eLogDirectory",
            "--launch-timeout-ms=$($LaunchTimeoutSeconds * 1000)"
        )
        $packagedDesktopE2eOutput = & $nodeCommand.Source @packagedDesktopE2eArguments 2>&1
        $packagedDesktopE2eExitCode = $LASTEXITCODE
        $packagedDesktopE2eOutput | ForEach-Object { Write-Host $_ }
        if ($packagedDesktopE2eExitCode -ne 0) {
            throw "Installed MSI packaged desktop mutating E2E failed with exit code $packagedDesktopE2eExitCode."
        }
        $packagedDesktopE2eSummaryPath = Join-Path $packagedDesktopE2eLogDirectory "summary.json"
        if (-not (Test-Path -LiteralPath $packagedDesktopE2eSummaryPath -PathType Leaf)) {
            throw "Packaged desktop mutating E2E did not publish its private summary."
        }
        $packagedDesktopE2eResult = Get-Content `
            -LiteralPath $packagedDesktopE2eSummaryPath `
            -Raw | ConvertFrom-Json
        if (
            $packagedDesktopE2eResult.status -ne "pass" -or
            $packagedDesktopE2eResult.backup_total_rows -le 0
        ) {
            throw "Packaged desktop mutating E2E summary is not a passing full-backup result."
        }
        $packagedDesktopE2eSummary = "PASS, backup rows $($packagedDesktopE2eResult.backup_total_rows)"
    }

    if ($RunPackagedHostClientE2E) {
        $nodeCommand = Get-Command "node.exe" -CommandType Application -ErrorAction Stop |
            Select-Object -First 1
        $packagedHostClientE2eRunner = Join-Path $PSScriptRoot "run-packaged-host-client-e2e.mjs"
        $packagedHostClientE2eWorkParent = New-PrivateQaDirectory `
            -Path (Join-Path ([IO.Path]::GetTempPath()) "filament-manager-packaged-host-client-e2e-$([Guid]::NewGuid().ToString('N'))") `
            -Description "Packaged Host-Client E2E work parent"
        $packagedHostClientE2eLogParent = New-PrivateQaDirectory `
            -Path (Join-Path $resolvedLogDirectory "packaged-host-client-e2e-private") `
            -Description "Packaged Host-Client E2E log parent"
        $packagedHostClientE2eWorkDirectory = Join-Path $packagedHostClientE2eWorkParent "work"
        $packagedHostClientE2eLogDirectory = Join-Path $packagedHostClientE2eLogParent "logs"
        $packagedHostClientE2eArguments = @(
            $packagedHostClientE2eRunner,
            "--executable=$installedExecutablePath",
            "--work-dir=$packagedHostClientE2eWorkDirectory",
            "--log-dir=$packagedHostClientE2eLogDirectory",
            "--launch-timeout-ms=$($LaunchTimeoutSeconds * 1000)"
        )
        $packagedHostClientE2eOutput = & $nodeCommand.Source @packagedHostClientE2eArguments 2>&1
        $packagedHostClientE2eExitCode = $LASTEXITCODE
        $packagedHostClientE2eOutput | ForEach-Object { Write-Host $_ }
        if ($packagedHostClientE2eExitCode -ne 0) {
            throw "Installed MSI packaged Host-Client mutating E2E failed with exit code $packagedHostClientE2eExitCode."
        }
        $packagedHostClientE2eSummaryPath = Join-Path $packagedHostClientE2eLogDirectory "summary.json"
        if (-not (Test-Path -LiteralPath $packagedHostClientE2eSummaryPath -PathType Leaf)) {
            throw "Packaged Host-Client mutating E2E did not publish its private summary."
        }
        $packagedHostClientE2eResult = Get-Content `
            -LiteralPath $packagedHostClientE2eSummaryPath `
            -Raw | ConvertFrom-Json
        $packagedHostClientE2eRunId = [string]$packagedHostClientE2eResult.run_id
        if (
            $packagedHostClientE2eResult.status -ne "pass" -or
            $packagedHostClientE2eResult.host_weight_g -ne 760 -or
            $packagedHostClientE2eResult.client_local_weight_g -ne 333 -or
            $packagedHostClientE2eResult.cache_weight_g -ne 760 -or
            $packagedHostClientE2eResult.session_renewed -ne $true -or
            $packagedHostClientE2eResult.auth_cleared -ne $true -or
            $packagedHostClientE2eResult.auth_cleanup -ne "pass" -or
            $packagedHostClientE2eResult.catalog_jobs.succeeded -ne 1 -or
            $packagedHostClientE2eResult.catalog_jobs.interrupted -ne 1 -or
            $packagedHostClientE2eResult.catalog_jobs.imported -ne 1 -or
            $packagedHostClientE2eResult.catalog_jobs.client_jobs -ne 0
        ) {
            throw "Packaged Host-Client mutating E2E summary is not a passing authority-isolation result."
        }
        $packagedHostClientE2eSummary = `
            "PASS, Host $($packagedHostClientE2eResult.host_weight_g) g, Client shadow $($packagedHostClientE2eResult.client_local_weight_g) g"
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
    $appWindow = $null
    $observedWindowTitle = ""
    while ([DateTime]::UtcNow -lt $launchDeadline) {
        Start-Sleep -Milliseconds 500
        $appProcess.Refresh()
        if ($appProcess.HasExited) {
            throw "Installed app exited before becoming ready with exit code $($appProcess.ExitCode)."
        }

        $visibleAppWindows = @(
            Get-VisibleExpectedAppWindows `
                -ProcessId $appProcess.Id `
                -ExpectedTitles $ExpectedWindowTitles
        )
        $windowReady = $visibleAppWindows.Count -gt 0
        if ($windowReady) {
            $appWindow = $visibleAppWindows[0]
            $observedWindowTitle = $appWindow.Title
        }
        else {
            $appWindow = $null
        }
        $databaseReady = Test-Path -LiteralPath $databasePath -PathType Leaf
        if ($windowReady -and $databaseReady) {
            break
        }
    }
    if (-not $windowReady -or -not $databaseReady) {
        $windowSnapshot = Format-ProcessWindowSnapshot -ProcessId $appProcess.Id
        throw "App did not become ready within $LaunchTimeoutSeconds seconds (windowReady=$windowReady, databaseReady=$databaseReady, top-level windows=$windowSnapshot)."
    }

    Invoke-DatabaseVerification -DatabasePath $databasePath

    Request-AppWindowClose `
        -Window $appWindow `
        -Description "The app's normal main window"
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
    $backgroundProcessInfo = Get-CimInstance `
        -ClassName Win32_Process `
        -Filter "ProcessId = $backgroundPrimaryProcessId"
    if ($null -eq $backgroundProcessInfo) {
        throw "Could not inspect the background process command line."
    }
    $backgroundCommandLine = [string]$backgroundProcessInfo.CommandLine
    if (-not [Regex]::IsMatch($backgroundCommandLine, '(?i)(?:^|\s)--background(?:\s|$)')) {
        throw "Background process command line does not contain the exact --background argument: $backgroundCommandLine"
    }

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
    $restoredAppWindow = $null
    while ([DateTime]::UtcNow -lt $restoreDeadline) {
        Start-Sleep -Milliseconds 500
        $appProcess.Refresh()
        if ($appProcess.HasExited) {
            throw "The background primary process exited while the secondary instance requested its window."
        }

        $visibleAppWindows = @(
            Get-VisibleExpectedAppWindows `
                -ProcessId $appProcess.Id `
                -ExpectedTitles $ExpectedWindowTitles
        )
        if ($visibleAppWindows.Count -gt 0) {
            $restoredAppWindow = $visibleAppWindows[0]
            $restoredWindowReady = $true
            break
        }
    }
    if (-not $restoredWindowReady) {
        $windowSnapshot = Format-ProcessWindowSnapshot -ProcessId $backgroundPrimaryProcessId
        throw "The normal secondary instance did not restore the primary window within $LaunchTimeoutSeconds seconds (primaryPid=$backgroundPrimaryProcessId, top-level windows=$windowSnapshot)."
    }

    $matchingProcesses = @(Get-Process -Name $executableBaseName -ErrorAction SilentlyContinue)
    if ($matchingProcesses.Count -ne 1) {
        throw "Expected one app process after the secondary instance exited, but found $($matchingProcesses.Count)."
    }
    if ($matchingProcesses[0].Id -ne $backgroundPrimaryProcessId) {
        throw "The restored window belongs to PID $($matchingProcesses[0].Id), not the original background primary PID $backgroundPrimaryProcessId."
    }

    Request-AppWindowClose `
        -Window $restoredAppWindow `
        -Description "The background-enabled app's restored main window"
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
        "Observed window title: $observedWindowTitle",
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
        "Previous-release database gate: $previousReleaseDatabaseGateSummary",
        "Packaged desktop mutating E2E: $packagedDesktopE2eSummary",
        "Packaged Host-Client mutating E2E: $packagedHostClientE2eSummary",
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
                Stop-Process -InputObject $processToStop -Force -ErrorAction Stop
                $processToStop.WaitForExit()
            }
        }
        catch {
            $applicationStoppedForCleanup = $false
            Write-Warning "Failed to stop app process $($processToStop.Id) during smoke cleanup: $($_.Exception.Message)"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($installedExecutablePath)) {
        try {
            $exactProcessesStopped = Stop-ProcessesForExactExecutable `
                -ExecutablePath $installedExecutablePath `
                -TimeoutSeconds 5
            if ($exactProcessesStopped -gt 0) {
                Write-Warning "Stopped $exactProcessesStopped residual smoke-owned process(es) for the exact installed executable path."
            }
        }
        catch {
            $applicationStoppedForCleanup = $false
            Write-Warning "Failed to confirm exact installed-executable process cleanup: $($_.Exception.Message)"
        }
    }

    $packagedHostClientCredentialCleanupSucceeded = $true
    if (
        $null -ne $packagedHostClientE2eWorkDirectory -and
        (Test-Path -LiteralPath $packagedHostClientE2eWorkDirectory -PathType Container)
    ) {
        if (
            -not $applicationStoppedForCleanup -or
            [string]::IsNullOrWhiteSpace($installedExecutablePath) -or
            [string]::IsNullOrWhiteSpace($packagedHostClientE2eLogDirectory) -or
            [string]::IsNullOrWhiteSpace($packagedHostClientE2eRunner)
        ) {
            $packagedHostClientCredentialCleanupSucceeded = $false
            Write-Warning "Retained packaged Host-Client credentials could not be cleaned because exact installed-process termination was not confirmed."
        }
        else {
            try {
                $runIdentityPath = Join-Path `
                    $packagedHostClientE2eLogDirectory `
                    "run-identity.json"
                if (-not (Test-Path -LiteralPath $runIdentityPath -PathType Leaf)) {
                    throw "Packaged Host-Client cleanup is missing its private run identity."
                }
                $runIdentity = Get-Content -LiteralPath $runIdentityPath -Raw |
                    ConvertFrom-Json
                $runIdentityFields = @(
                    $runIdentity.PSObject.Properties.Name | Sort-Object
                )
                $expectedRunIdentityFields = @("format", "run_id") | Sort-Object
                $runIdentityFieldDifference = @(
                    Compare-Object $runIdentityFields $expectedRunIdentityFields
                )
                if (
                    $runIdentityFieldDifference.Count -ne 0 -or
                    $runIdentity.format -ne "filament-manager-packaged-host-client-e2e-run-identity-v1" -or
                    [string]$runIdentity.run_id -notmatch '^packaged-host-client-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ) {
                    throw "Packaged Host-Client cleanup run identity is invalid."
                }
                $packagedHostClientE2eRunId = [string]$runIdentity.run_id
                $nodeCommand = Get-Command "node.exe" -CommandType Application -ErrorAction Stop |
                    Select-Object -First 1
                $credentialCleanupArguments = @(
                    $packagedHostClientE2eRunner,
                    "--executable=$installedExecutablePath",
                    "--work-dir=$packagedHostClientE2eWorkDirectory",
                    "--log-dir=$packagedHostClientE2eLogDirectory",
                    "--launch-timeout-ms=$($LaunchTimeoutSeconds * 1000)",
                    "--resume-credential-cleanup"
                )
                $credentialCleanupOutput = & $nodeCommand.Source @credentialCleanupArguments 2>&1
                $credentialCleanupExitCode = $LASTEXITCODE
                $credentialCleanupOutput | ForEach-Object { Write-Host $_ }
                if ($credentialCleanupExitCode -ne 0) {
                    throw "Packaged Host-Client credential cleanup resume failed with exit code $credentialCleanupExitCode."
                }
                $credentialCleanupSummaryPath = Join-Path `
                    $packagedHostClientE2eLogDirectory `
                    "credential-cleanup-summary.json"
                if (-not (Test-Path -LiteralPath $credentialCleanupSummaryPath -PathType Leaf)) {
                    throw "Packaged Host-Client credential cleanup did not publish its private summary."
                }
                $credentialCleanupResult = Get-Content `
                    -LiteralPath $credentialCleanupSummaryPath `
                    -Raw | ConvertFrom-Json
                $credentialCleanupFields = @(
                    $credentialCleanupResult.PSObject.Properties.Name | Sort-Object
                )
                $expectedCredentialCleanupFields = @(
                    "format",
                    "status",
                    "run_id",
                    "auth_cleared",
                    "auth_setting_count",
                    "client_schema_version",
                    "cleanup_launch",
                    "process_termination_confirmed"
                ) | Sort-Object
                $credentialCleanupFieldDifference = @(
                    Compare-Object `
                        $credentialCleanupFields `
                        $expectedCredentialCleanupFields
                )
                if (
                    $credentialCleanupFieldDifference.Count -ne 0 -or
                    $credentialCleanupResult.format -ne "filament-manager-packaged-host-client-e2e-credential-cleanup-summary-v1" -or
                    $credentialCleanupResult.status -ne "pass" -or
                    [string]$credentialCleanupResult.run_id -ne $packagedHostClientE2eRunId -or
                    $credentialCleanupResult.auth_cleared -ne $true -or
                    [int64]$credentialCleanupResult.auth_setting_count -ne 0 -or
                    [int64]$credentialCleanupResult.client_schema_version -lt 1 -or
                    [string]$credentialCleanupResult.cleanup_launch -notmatch '^attempt-(?:[2-9]|[1-9][0-9]+)$' -or
                    $credentialCleanupResult.process_termination_confirmed -ne $true
                ) {
                    throw "Packaged Host-Client credential cleanup summary is not passing."
                }
                if (Test-Path -LiteralPath $packagedHostClientE2eWorkDirectory) {
                    throw "Packaged Host-Client credential cleanup retained its private work directory."
                }
            }
            catch {
                $packagedHostClientCredentialCleanupSucceeded = $false
                Write-Warning "Failed to resume packaged Host-Client credential cleanup: $($_.Exception.Message)"
            }
            try {
                Stop-ProcessesForExactExecutable `
                    -ExecutablePath $installedExecutablePath `
                    -TimeoutSeconds 5 | Out-Null
            }
            catch {
                $applicationStoppedForCleanup = $false
                $packagedHostClientCredentialCleanupSucceeded = $false
                Write-Warning "Failed to confirm process cleanup after credential cleanup resume: $($_.Exception.Message)"
            }
        }
    }

    $packagedHostClientHarnessCleanupSafe = `
        $applicationStoppedForCleanup -and `
        $packagedHostClientCredentialCleanupSucceeded -and `
        (
            $null -eq $packagedHostClientE2eWorkDirectory -or `
            -not (Test-Path -LiteralPath $packagedHostClientE2eWorkDirectory -PathType Container)
        )
    if (-not $packagedHostClientHarnessCleanupSafe) {
        Write-Warning "Retaining private packaged Host-Client E2E state because harness process termination or cleanup was not confirmed."
    }

    if (
        $applicationStoppedForCleanup -and
        $packagedHostClientHarnessCleanupSafe -and
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

    if (
        $null -ne $packagedDesktopE2eWorkParent -and
        (Test-Path -LiteralPath $packagedDesktopE2eWorkParent -PathType Container)
    ) {
        try {
            Remove-Item `
                -LiteralPath $packagedDesktopE2eWorkParent `
                -Recurse `
                -Force `
                -ErrorAction Stop
        }
        catch {
            Write-Warning "Failed to remove the private packaged desktop E2E work parent: $($_.Exception.Message)"
        }
    }

    if (
        $null -ne $packagedHostClientE2eWorkParent -and
        (Test-Path -LiteralPath $packagedHostClientE2eWorkParent -PathType Container)
    ) {
        if ($packagedHostClientHarnessCleanupSafe) {
            try {
                Remove-Item `
                    -LiteralPath $packagedHostClientE2eWorkParent `
                    -Recurse `
                    -Force `
                    -ErrorAction Stop
            }
            catch {
                Write-Warning "Failed to remove the private packaged Host-Client E2E work parent: $($_.Exception.Message)"
            }
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
