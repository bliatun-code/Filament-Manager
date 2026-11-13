; Tauri's MSI detection looks in HKLM. The published Filament Manager MSI is
; installed per-user, so query Windows Installer directly for the pilot.
!define FM_PILOT_MSI_UPGRADE_CODE "{B771FEDE-3DDB-51DB-89FE-90B617DFF72A}"

!macro NSIS_HOOK_PREINSTALL
  Call FmPilotReplaceMsi
!macroend

Function FmPilotReplaceMsi
  ; Never migrate into a different directory or uninstall a different MSI.
  StrCmp $INSTDIR "$LOCALAPPDATA\Filament Manager" 0 unexpected
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_PILOT_MSI_UPGRADE_CODE}", i 0, i 0, w .r0) i.r1'
  StrCmp $1 259 no_msi
  StrCmp $1 0 0 unexpected
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_PILOT_MSI_UPGRADE_CODE}", i 0, i 1, w .r2) i.r1'
  StrCmp $1 259 0 unexpected

  ; A null SID and context 2 restrict these checks to this user's unmanaged MSI.
  System::Call 'msi::MsiGetProductInfoExW(w r0, p 0, i 2, w "State", w .r2, *i ${NSIS_MAX_STRLEN}) i.r1'
  StrCmp $1 0 0 unexpected
  StrCmp $2 5 0 unexpected
  System::Call 'msi::MsiGetProductInfoExW(w r0, p 0, i 2, w "VersionString", w .r2, *i ${NSIS_MAX_STRLEN}) i.r1'
  StrCmp $1 0 0 unexpected
  StrCmp $2 "0.35.1" 0 unexpected
  System::Call 'msi::MsiGetProductInfoExW(w r0, p 0, i 2, w "InstallLocation", w .r2, *i ${NSIS_MAX_STRLEN}) i.r1'
  StrCmp $1 0 0 unexpected
  StrCmp $2 "$INSTDIR" remove_msi
  StrCmp $2 "$INSTDIR\" 0 unexpected

remove_msi:
  ; Release the installation directory as working directory before MSI removal.
  SetOutPath "$TEMP"
  DetailPrint "Removing the current user's Filament Manager 0.35.1 MSI."
  ClearErrors
  ExecWait '"$SYSDIR\msiexec.exe" /x $0 /qn /norestart' $1
  IfErrors uninstall_failed
  StrCmp $1 0 0 uninstall_failed
  System::Call 'msi::MsiEnumRelatedProductsW(w "${FM_PILOT_MSI_UPGRADE_CODE}", i 0, i 0, w .r2) i.r1'
  StrCmp $1 259 0 uninstall_failed
  SetOutPath "$INSTDIR"
  Return

no_msi:
  IfFileExists "$INSTDIR\bambu-filament-manager.exe" unexpected
  Return

unexpected:
  DetailPrint "The NSIS pilot could not confirm an eligible per-user MSI installation."
  SetErrorLevel 1
  Abort

uninstall_failed:
  DetailPrint "Windows Installer did not remove the previous Filament Manager MSI (code $1)."
  SetErrorLevel 1
  Abort
FunctionEnd
