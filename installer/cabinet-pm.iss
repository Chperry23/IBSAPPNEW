; Inno Setup script for Cabinet PM tablet installs / upgrades.
; Compile with Inno Setup 6+: ISCC.exe installer\cabinet-pm.iss
;
; Critical: DefaultDir is under LocalAppData\Programs so upgrades replace
; program files only. SQLite lives in %APPDATA%\CabinetPM (see tablet-paths.js).
; Never ship or overwrite the database from this installer.

#define MyAppName "Cabinet PM"
#define MyAppPublisher "ECI Industrial Solutions"
#define MyAppExeName "CabinetPM.exe"
#ifndef MyAppVersion
  #define MyAppVersion "2.0.1"
#endif

[Setup]
AppId={{8F3C2A1B-9D4E-4F6A-B2C1-CABINETPM0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
; Always this folder. A custom directory (Downloads, a folder they created,
; Program Files without admin) can be deleted when the app closes and the shortcut breaks.
; This is per-user LocalAppData, not C:\Program Files. No admin needed.
DefaultDirName={localappdata}\Programs\CabinetPM
DisableDirPage=yes
UsePreviousAppDir=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=CabinetPM-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#MyAppExeName}
; Do not touch AppData on uninstall by default (field data preserved)
[UninstallDelete]
; intentionally empty — leave %APPDATA%\CabinetPM alone

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Stage with: node scripts/stage-installer-payload.js
Source: "..\dist\installer-payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Live tablet DB is never installed here — AppData only (see tablet-paths.js)

[Icons]
; Launch-CabinetPM.vbs starts the exe with no console window. Logs stay in {app}\logs.
Name: "{group}\{#MyAppName}"; Filename: "{app}\Launch-CabinetPM.vbs"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Launch-CabinetPM.vbs"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

; Do not launch from the wizard. Finishing setup while the exe is still
; running from a user-picked folder has left that folder empty after they close the app.
[Run]
Filename: "{app}\Launch-CabinetPM.vbs"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent shellexec unchecked

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
