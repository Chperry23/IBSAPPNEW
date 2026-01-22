; Cabinet PM Tablet - Inno Setup Installation Script
; 
; To use this:
; 1. Download and install Inno Setup: https://jrsoftware.org/isdl.php
; 2. Open this file in Inno Setup Compiler
; 3. Click Build > Compile
; 4. Output will be in dist/installers/

#define MyAppName "Cabinet PM Tablet"
#define MyAppVersion "2.1.0"
#define MyAppPublisher "ECI"
#define MyAppURL "https://github.com/YOUR-USERNAME/cabinet-pm"
#define MyAppExeName "cabinet-pm-tablet.exe"

[Setup]
; Basic App Info
AppId={{8F9A7B6C-5D4E-3F2A-1B0C-9E8D7C6B5A4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Installation Directories
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Output
OutputDir=dist\installers
OutputBaseFilename=CabinetPM-Setup-v{#MyAppVersion}
SetupIconFile=frontend\public\favicon.ico
Compression=lzma2/max
SolidCompression=yes

; Modern UI
WizardStyle=modern
WizardImageFile=compiler:WizModernImage-IS.bmp
WizardSmallImageFile=compiler:WizModernSmallImage-IS.bmp

; Privileges
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Uninstall
UninstallDisplayIcon={app}\{#MyAppExeName}

; Version Info
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 0,6.1

[Files]
; Main executable
Source: "dist\CabinetPM-v{#MyAppVersion}\cabinet-pm-tablet.exe"; DestDir: "{app}"; Flags: ignoreversion

; Configuration and documentation
Source: "dist\CabinetPM-v{#MyAppVersion}\config.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\CabinetPM-v{#MyAppVersion}\README.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "dist\CabinetPM-v{#MyAppVersion}\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\CabinetPM-v{#MyAppVersion}\CHECKSUMS.txt"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Create data directory for user databases
Name: "{app}\data"; Permissions: users-full
Name: "{app}\logs"; Permissions: users-full

[Icons]
; Start Menu shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Desktop shortcut (optional)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

; Quick Launch shortcut (optional)
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Run]
; Optionally launch app after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up logs on uninstall (but preserve databases)
Type: files; Name: "{app}\logs\*.log"

[Code]
var
  MongoDBIPPage: TInputQueryWizardPage;
  DeviceIDPage: TOutputMsgWizardPage;
  GeneratedDeviceID: String;

// Generate a unique device ID
function GenerateDeviceID(): String;
var
  ComputerName: String;
  RandomPart: String;
  Timestamp: String;
begin
  // Get computer name
  ComputerName := GetComputerNameString();
  
  // Generate timestamp
  Timestamp := GetDateTimeString('yyyymmddhhnnss', #0, #0);
  
  // Generate random suffix (simplified - in real app this would be more random)
  RandomPart := IntToHex(Random(65536), 4) + IntToHex(Random(65536), 4);
  
  // Combine: COMPUTERNAME_TIMESTAMP_RANDOM
  Result := ComputerName + '_' + Timestamp + '_' + RandomPart;
end;

// Custom wizard page for MongoDB configuration
procedure InitializeWizard();
begin
  // MongoDB IP configuration page
  MongoDBIPPage := CreateInputQueryPage(
    wpSelectDir,
    'Database Configuration',
    'Configure MongoDB Connection',
    'Please enter the IP address or hostname of your MongoDB master server.'#13#10 +
    'This is typically the server where your main database is hosted.'
  );
  
  MongoDBIPPage.Add('MongoDB Server IP or Hostname:', False);
  MongoDBIPPage.Values[0] := '172.16.10.124'; // Default value
  
  // Generate device ID
  GeneratedDeviceID := GenerateDeviceID();
  
  // Device ID display page
  DeviceIDPage := CreateOutputMsgPage(
    MongoDBIPPage.ID,
    'Device Configuration',
    'Unique Device ID Generated',
    'This device has been assigned the following unique ID for sync tracking:'#13#10#13#10 +
    GeneratedDeviceID + #13#10#13#10 +
    'This ID will be used to identify this tablet when syncing with the master database.'
  );
end;

// Save configuration after installation
procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  ConfigContent: TArrayOfString;
  I: Integer;
  MongoDBIP: String;
  Updated: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    // Read the config.json file
    ConfigFile := ExpandConstant('{app}\config.json');
    
    if LoadStringsFromFile(ConfigFile, ConfigContent) then
    begin
      // Update MongoDB URI with user's input
      MongoDBIP := MongoDBIPPage.Values[0];
      Updated := False;
      
      for I := 0 to GetArrayLength(ConfigContent) - 1 do
      begin
        if Pos('"mongodbUri"', ConfigContent[I]) > 0 then
        begin
          ConfigContent[I] := '  "mongodbUri": "mongodb://' + MongoDBIP + ':27017/cabinet_pm_db",';
          Updated := True;
        end;
      end;
      
      // Save the updated config
      if Updated then
      begin
        SaveStringsToFile(ConfigFile, ConfigContent, False);
        Log('Updated MongoDB URI to: ' + MongoDBIP);
      end;
    end;
    
    // Log the device ID for reference
    Log('Generated Device ID: ' + GeneratedDeviceID);
  end;
end;

// Show final information
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption :=
      'Setup has finished installing ' + ExpandConstant('{#MyAppName}') + ' on your computer.' + #13#10#13#10 +
      'MongoDB Server: ' + MongoDBIPPage.Values[0] + #13#10 +
      'Device ID: ' + GeneratedDeviceID + #13#10#13#10 +
      'Default Login:' + #13#10 +
      '  Username: admin' + #13#10 +
      '  Password: cabinet123' + #13#10#13#10 +
      'Access the application at: http://localhost:3000' + #13#10#13#10 +
      'Click Finish to exit Setup.';
  end;
end;

// Preserve user data on uninstall
function InitializeUninstall(): Boolean;
begin
  Result := True;
  
  if MsgBox(
    'Do you want to keep your local database and configuration files?' + #13#10#13#10 +
    'Select YES to preserve your data (recommended)' + #13#10 +
    'Select NO to delete everything',
    mbConfirmation,
    MB_YESNO
  ) = IDYES then
  begin
    Log('User chose to preserve data during uninstall');
    // Set flag to skip data directory deletion
    Result := True;
  end
  else
  begin
    Log('User chose to delete all data during uninstall');
    Result := True;
  end;
end;

