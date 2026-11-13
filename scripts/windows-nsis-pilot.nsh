; The four published per-user x64 packages use this Windows Installer UpgradeCode.
; Keep each ProductCode/version pair in sync with windows-nsis-msi-sources.json.
!define FM_MSI_UPGRADE_CODE "{B771FEDE-3DDB-51DB-89FE-90B617DFF72A}"
!define FM_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define FM_STARTUP_APPROVAL_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
!define FM_AUTOSTART_ID "no.bliatun.filamentmanager"
!define FM_LEGACY_AUTOSTART_ID "Filament Manager"

Var FmInstallerMutex
Var FmStableRun
Var FmLegacyRun
Var FmStableApproval
Var FmStableApprovalSize
Var FmLegacyApproval
Var FmLegacyApprovalSize

!macro FmAbortInstall MESSAGE
  DetailPrint "${MESSAGE}"
  ${If} ${Silent}
    System::Call 'kernel32::AttachConsole(i -1)i.r8'
    ${If} $8 <> 0
      System::Call 'kernel32::GetStdHandle(i -12)p.r8'
      FileWrite $8 "${MESSAGE}$\r$\n"
    ${EndIf}
  ${Else}
    MessageBox MB_ICONSTOP|MB_OK "${MESSAGE}"
  ${EndIf}
  SetErrorLevel 1
  Abort
!macroend

; Both setup and uninstall share this per-session lock until their process exits.
!macro FmAcquireInstallerLock
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\no.bliatun.filamentmanager.setup")p.r8 ?e'
  Pop $7
  ${If} $8 == 0
  ${OrIf} $8 == error
  ${OrIf} $7 = 183
    !insertmacro FmAbortInstall "Another Filament Manager setup may be open. Close it and try again."
  ${EndIf}
  StrCpy $FmInstallerMutex $8
!macroend

!macro NSIS_HOOK_PREINSTALL
  Call FmPrepareInstall
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Call un.FmRequireAppClosed
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "${FM_RUN_KEY}" "${FM_AUTOSTART_ID}"
    DeleteRegValue HKCU "${FM_RUN_KEY}" "${FM_LEGACY_AUTOSTART_ID}"
    DeleteRegValue HKCU "${FM_STARTUP_APPROVAL_KEY}" "${FM_AUTOSTART_ID}"
    DeleteRegValue HKCU "${FM_STARTUP_APPROVAL_KEY}" "${FM_LEGACY_AUTOSTART_ID}"
  ${EndIf}
!macroend

; Keep the actual desktop process (including an invisible host/tray window)
; intact if the app is open. Restart Manager identifies it by executable path.
!macro FmDefineRequireAppClosed PREFIX
Function ${PREFIX}FmRequireAppClosed
  IfFileExists "$INSTDIR\bambu-filament-manager.exe" 0 done
  !insertmacro RestartManager_StartSession $9
  StrCmp $9 "" inspection_failed
  !insertmacro RestartManager_RegisterFile $9 "$INSTDIR\bambu-filament-manager.exe"
  StrCmp $0 0 0 end_session
  System::Call 'Rstrtmgr::RmGetList(i r9, *i .r1, *i 0, p 0, *i 0)i.r0'
end_session:
  !insertmacro RestartManager_EndSession $9
  StrCmp $0 0 done
  StrCmp $0 234 running
inspection_failed:
  !insertmacro FmAbortInstall "Setup could not check whether Filament Manager is running. Close it completely, including from the tray, then try again."
running:
  !insertmacro FmAbortInstall "Filament Manager is running. Exit it from the tray or the application menu, then run setup again."
done:
FunctionEnd
!macroend

!insertmacro FmDefineRequireAppClosed ""
!insertmacro FmDefineRequireAppClosed "un."

; Normalize paths without following reparse points. Reject a result that does
; not fit in the Win32 buffer and trim the usual MSI trailing separator.
!macro FmFullPath INPUT OUTPUT
  System::Call 'kernel32::GetFullPathNameW(w "${INPUT}", i ${NSIS_MAX_STRLEN}, w .r7, p 0)i.r8'
  ${If} $8 == error
  ${OrIf} $8 = 0
  ${OrIf} $8 >= ${NSIS_MAX_STRLEN}
    StrCpy $7 ""
  ${EndIf}
  StrCpy $8 $7 1 -1
  StrCmp $8 "\" 0 +2
  StrCpy $7 $7 -1
  StrCpy ${OUTPUT} $7
!macroend

!macro FmRejectReparsePoint PATH
  System::Call 'kernel32::GetFileAttributesW(w "${PATH}")i.r8 ?e'
  Pop $7
  StrCmp $8 error unsafe
  ${If} $8 = -1
    ${If} $7 <> 2
    ${AndIf} $7 <> 3
      Goto unsafe
    ${EndIf}
  ${Else}
    IntOp $8 $8 & 0x400
    StrCmp $8 0 0 unsafe
  ${EndIf}
!macroend

Function FmValidateInstallPath
  !insertmacro FmFullPath "$INSTDIR" $4
  StrCmp $4 "" unsafe
  !insertmacro FmFullPath "$PROFILE" $5
  StrCmp $5 "" unsafe
  StrLen $6 "$5\"
  StrCpy $7 $4 $6
  StrCmp $7 "$5\" 0 unsafe

  ; The install directory must be separate from either database location.
  StrCmp $4 "$LOCALAPPDATA" unsafe
  StrCmp $4 "$APPDATA" unsafe
  StrLen $6 "$LOCALAPPDATA\${FM_AUTOSTART_ID}\"
  StrCpy $7 "$4\" $6
  StrCmp $7 "$LOCALAPPDATA\${FM_AUTOSTART_ID}\" unsafe
  StrLen $6 "$APPDATA\${FM_AUTOSTART_ID}\"
  StrCpy $7 "$4\" $6
  StrCmp $7 "$APPDATA\${FM_AUTOSTART_ID}\" unsafe

  ; Check both existing installer-owned files and each parent directory.
  !insertmacro FmRejectReparsePoint "$4\bambu-filament-manager.exe"
  !insertmacro FmRejectReparsePoint "$4\uninstall.exe"
  StrCpy $6 $4
check_parents:
  !insertmacro FmRejectReparsePoint "$6"
  StrCmp $6 $5 valid
  ${GetParent} "$6" $7
  StrCmp $7 "" unsafe
  StrCpy $6 $7
  Goto check_parents

valid:
  StrCpy $INSTDIR $4
  Return
unsafe:
  !insertmacro FmAbortInstall "Choose a local installation folder in your Windows user profile, separate from the Filament Manager library and any redirected folders."
FunctionEnd

!macro FmReadMsiProperty PROPERTY
  System::Call 'msi::MsiGetProductInfoExW(w r0, p 0, i 2, w "${PROPERTY}", w .r2, *i ${NSIS_MAX_STRLEN})i.r1'
  StrCmp $1 0 0 unsupported
!macroend

; Windows approval is REG_BINARY. Preserve the opaque data exactly, without
; interpreting a Windows-version-specific flag or executing a registry string.
!macro FmSaveStartupApproval NAME BUFFER SIZE
  System::Alloc ${NSIS_MAX_STRLEN}
  Pop ${BUFFER}
  StrCmp ${BUFFER} 0 autostart_read_failed
  StrCpy $7 ${BUFFER}
  ; For an in/out System parameter, the input already advances to the output
  ; slot. An extra dot before r6 would discard the returned byte count.
  System::Call 'advapi32::RegGetValueW(p 0x80000001, w "${FM_STARTUP_APPROVAL_KEY}", w "${NAME}", i 0x08, p 0, p r7, *i ${NSIS_MAX_STRLEN} r6)i.r5'
  StrCpy ${SIZE} 0
  ${If} $5 = 0
    StrCpy ${SIZE} $6
  ${ElseIf} $5 <> 2
    Goto autostart_read_failed
  ${EndIf}
!macroend

!macro FmRestoreStartupApproval NAME BUFFER SIZE
  ${If} ${SIZE} > 0
    StrCpy $7 ${BUFFER}
    StrCpy $6 ${SIZE}
    System::Call 'advapi32::RegSetKeyValueW(p 0x80000001, w "${FM_STARTUP_APPROVAL_KEY}", w "${NAME}", i 3, p r7, i r6)i.r5'
    StrCmp $5 0 0 autostart_write_failed
  ${EndIf}
!macroend

Function FmReadAutostart
  ReadRegStr $FmStableRun HKCU "${FM_RUN_KEY}" "${FM_AUTOSTART_ID}"
  StrCmp $FmStableRun '$\"$INSTDIR\bambu-filament-manager.exe$\" --background' +2
  StrCpy $FmStableRun ""
  ReadRegStr $FmLegacyRun HKCU "${FM_RUN_KEY}" "${FM_LEGACY_AUTOSTART_ID}"
  StrCmp $FmLegacyRun '$\"$INSTDIR\bambu-filament-manager.exe$\" --background' +2
  StrCpy $FmLegacyRun ""
  !insertmacro FmSaveStartupApproval "${FM_AUTOSTART_ID}" $FmStableApproval $FmStableApprovalSize
  !insertmacro FmSaveStartupApproval "${FM_LEGACY_AUTOSTART_ID}" $FmLegacyApproval $FmLegacyApprovalSize
  Return
autostart_read_failed:
  !insertmacro FmAbortInstall "Setup could not read the current launch-at-login settings. The MSI was left in place. Try again after resolving access to your Windows startup settings."
FunctionEnd

Function FmRestoreAutostart
  ; Restore Windows approval before recreating either app-owned Run entry.
  !insertmacro FmRestoreStartupApproval "${FM_AUTOSTART_ID}" $FmStableApproval $FmStableApprovalSize
  !insertmacro FmRestoreStartupApproval "${FM_LEGACY_AUTOSTART_ID}" $FmLegacyApproval $FmLegacyApprovalSize
  System::Free $FmStableApproval
  System::Free $FmLegacyApproval
  ${If} $FmStableRun != ""
    ClearErrors
    WriteRegStr HKCU "${FM_RUN_KEY}" "${FM_AUTOSTART_ID}" "$FmStableRun"
    IfErrors autostart_write_failed
  ${EndIf}
  ${If} $FmLegacyRun != ""
    ClearErrors
    WriteRegStr HKCU "${FM_RUN_KEY}" "${FM_LEGACY_AUTOSTART_ID}" "$FmLegacyRun"
    IfErrors autostart_write_failed
  ${EndIf}
  Return
autostart_write_failed:
  !insertmacro FmAbortInstall "Setup could not restore launch at login. Your library is still on disk. Run setup again, then review launch at login in Filament Manager Settings."
FunctionEnd

Function FmPrepareInstall
  Call FmValidateInstallPath
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_MSI_UPGRADE_CODE}", i 0, i 0, w .r0)i.r1'
  StrCmp $1 259 no_msi
  StrCmp $1 0 0 unsupported
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_MSI_UPGRADE_CODE}", i 0, i 1, w .r2)i.r1'
  StrCmp $1 259 0 unsupported

  ; A null SID and context 2 restrict the MSI lookup to this user's
  ; unmanaged product. Confirm the version of each specific published package.
  !insertmacro FmReadMsiProperty "State"
  StrCmp $2 5 0 unsupported
  !insertmacro FmReadMsiProperty "VersionString"
  StrCmp "$0:$2" "{E39774D8-7B6D-431C-BEDB-2EF6F4B64B52}:0.33.0" eligible
  StrCmp "$0:$2" "{68C16157-4191-4C3E-A3EC-820D1F66A4EC}:0.34.0" eligible
  StrCmp "$0:$2" "{839D9EC2-6F41-43FB-93F4-893A71353B78}:0.35.0" eligible
  StrCmp "$0:$2" "{BEFA7FBD-D3A2-43DD-8317-F4873A0A5A01}:0.35.1" eligible unsupported

eligible:
  nsis_tauri_utils::SemverCompare "${VERSION}" $2
  Pop $1
  StrCmp $1 1 0 not_newer
  !insertmacro FmReadMsiProperty "InstallLocation"
  !insertmacro FmFullPath "$2" $3
  StrCmp $3 "" unsupported
  StrCmp $3 "$INSTDIR" 0 wrong_directory
  IfFileExists "$INSTDIR\bambu-filament-manager.exe" 0 unsupported
  ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Filament Manager" "UninstallString"
  StrCmp $4 "" 0 unsupported
  Push $0
  Call FmRequireAppClosed
  Call FmReadAutostart
  Pop $0

  ; Release the target folder and let Windows Installer clean up its own files,
  ; shortcuts and optional PATH entry. NSIS does not add a PATH entry.
  SetOutPath "$TEMP"
  DetailPrint "Removing the supported Filament Manager MSI for this Windows user."
  ClearErrors
  ExecWait '"$SYSDIR\msiexec.exe" /x $0 /qn /norestart' $1
  IfErrors uninstall_failed
  Push $1
  Call FmRestoreAutostart
  Pop $1
  StrCmp $1 0 0 uninstall_failed
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_MSI_UPGRADE_CODE}", i 0, i 0, w .r2)i.r1'
  StrCmp $1 259 0 uninstall_failed
  Return

no_msi:
  ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Filament Manager" "UninstallString"
  StrCmp $4 "" unregistered
  ReadRegStr $5 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Filament Manager" "InstallLocation"
  ; The Tauri template records a quoted InstallLocation.
  StrCmp $5 '$\"$INSTDIR$\"' 0 wrong_nsis_directory
  StrCmp $4 '$\"$INSTDIR\uninstall.exe$\"' 0 unsupported
  IfFileExists "$INSTDIR\uninstall.exe" 0 unsupported
  Call FmRequireAppClosed
  Return

unregistered:
  IfFileExists "$INSTDIR\bambu-filament-manager.exe" unsupported
  IfFileExists "$INSTDIR\uninstall.exe" unsupported
  Return

wrong_directory:
  !insertmacro FmAbortInstall "Filament Manager MSI is installed in $3. Select that folder and try again. For installations outside your profile, uninstall MSI in Windows Settings first; the library is retained."
wrong_nsis_directory:
  !insertmacro FmAbortInstall "Filament Manager NSIS is already installed in $5. Select that folder and try again."
not_newer:
  !insertmacro FmAbortInstall "This installer must be newer than the installed Filament Manager MSI."
unsupported:
  !insertmacro FmAbortInstall "Setup could not verify the existing Filament Manager installation. Uninstall it in Windows Settings and retry. Leave its library in place."
uninstall_failed:
  !insertmacro FmAbortInstall "Windows Installer did not complete the MSI removal. Check Windows Settings, finish any pending restart, and retry. Your library remains in place."
FunctionEnd
