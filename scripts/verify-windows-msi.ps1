[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$MsiDirectory,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedProductName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedProductVersion,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedArchitecture
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

        $value = $record.GetType().InvokeMember(
            "StringData",
            [Reflection.BindingFlags]::GetProperty,
            $null,
            $record,
            @([int]1)
        )
        return [string]$value
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

function Get-MsiTemplateSummary {
    param([Parameter(Mandatory = $true)][object]$Database)

    $summaryInformation = $null
    try {
        $summaryInformation = $Database.GetType().InvokeMember(
            "SummaryInformation",
            [Reflection.BindingFlags]::GetProperty,
            $null,
            $Database,
            @([int]0)
        )
        $value = $summaryInformation.GetType().InvokeMember(
            "Property",
            [Reflection.BindingFlags]::GetProperty,
            $null,
            $summaryInformation,
            @([int]7)
        )
        return [string]$value
    }
    finally {
        Release-ComObject $summaryInformation
    }
}

$resolvedMsiDirectory = (Resolve-Path -LiteralPath $MsiDirectory).Path
$msiFiles = @(Get-ChildItem -LiteralPath $resolvedMsiDirectory -Filter "*.msi" -File)
if ($msiFiles.Count -ne 1) {
    throw "Expected exactly one MSI in '$resolvedMsiDirectory'; found $($msiFiles.Count)."
}

$msiFile = $msiFiles[0]
if ($msiFile.Length -le 0) {
    throw "MSI '$($msiFile.FullName)' is empty."
}

$installer = $null
$database = $null
try {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.GetType().InvokeMember(
        "OpenDatabase",
        [Reflection.BindingFlags]::InvokeMethod,
        $null,
        $installer,
        @($msiFile.FullName, [int]0)
    )

    $actualProductName = Get-MsiProperty -Database $database -PropertyName "ProductName"
    $actualProductVersion = Get-MsiProperty -Database $database -PropertyName "ProductVersion"
    $templateSummary = Get-MsiTemplateSummary -Database $database
    $actualArchitecture = ($templateSummary -split ";", 2)[0]

    if (-not [string]::Equals($actualProductName, $ExpectedProductName, [StringComparison]::Ordinal)) {
        throw "MSI ProductName mismatch: expected '$ExpectedProductName', found '$actualProductName'."
    }
    if (-not [string]::Equals($actualProductVersion, $ExpectedProductVersion, [StringComparison]::Ordinal)) {
        throw "MSI ProductVersion mismatch: expected '$ExpectedProductVersion', found '$actualProductVersion'."
    }
    if (-not [string]::Equals($actualArchitecture, $ExpectedArchitecture, [StringComparison]::OrdinalIgnoreCase)) {
        throw "MSI architecture mismatch: expected '$ExpectedArchitecture', found '$actualArchitecture' in '$templateSummary'."
    }
}
finally {
    Release-ComObject $database
    Release-ComObject $installer
}

$checksumPath = Join-Path $resolvedMsiDirectory "SHA256SUMS-windows.txt"
$hash = Get-FileHash -LiteralPath $msiFile.FullName -Algorithm SHA256
$checksumLine = "$($hash.Hash.ToLowerInvariant())  $($msiFile.Name)"
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($checksumPath, "$checksumLine`n", $utf8WithoutBom)

Write-Host "Verified $($msiFile.Name): $actualProductName $actualProductVersion ($actualArchitecture)."
Write-Host "Wrote SHA-256 manifest to $checksumPath."
