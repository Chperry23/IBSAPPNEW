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
DefaultDirName={localappdata}\Programs\CabinetPM
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
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
