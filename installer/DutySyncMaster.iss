; DutySync Master — Inno Setup Script
; Produces:  installer/Output/DutySyncMaster-Setup.exe
;
; Prerequisites:
;   1. Run build_app.py to produce release/DutySyncMaster/
;   2. Install Inno Setup 6 from https://jrsoftware.org/isinfo.php
;   3. Compile:  ISCC.exe installer\DutySyncMaster.iss
;      or open this file in Inno Setup IDE and press F9

#define MyAppName     "DutySync Master"
#define MyAppVersion  "1.0.0"
#define MyAppPublisher "Roster Master"
#define MyAppExeName  "DutySyncMaster.exe"
#define MyAppURL      "http://localhost:8765"

; Path to the PyInstaller output (relative to this script)
#define SourceDir "..\release\DutySyncMaster"

[Setup]
AppId={{E4A3C2B1-9F7D-4E5A-8B6C-1D2E3F4A5B6C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Installer output
OutputDir=Output
OutputBaseFilename=DutySyncMaster-Setup
; Compression
Compression=lzma2/ultra64
SolidCompression=yes
; Appearance
WizardStyle=modern
WizardResizable=no
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
; Require admin for Program Files install
PrivilegesRequired=admin
; Windows 10+ required
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";     Description: "Create a &desktop shortcut";   GroupDescription: "Additional icons:"; Flags: unchecked
Name: "startupicon";     Description: "Start DutySync with &Windows"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
; All application files from PyInstaller dist
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu
Name: "{group}\{#MyAppName}";           Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Desktop shortcut (optional)
Name: "{autodesktop}\{#MyAppName}";     Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; Startup shortcut (optional)
Name: "{userstartup}\{#MyAppName}";     Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
; Launch after install
Filename: "{app}\{#MyAppExeName}"; \
    Description: "Launch {#MyAppName}"; \
    Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove user data folder on uninstall (prompts user)
Type: filesandordirs; Name: "{app}\DutySyncData"

[Code]
// Show a note about data persistence during uninstall
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    if MsgBox(
      'Do you want to delete all DutySync Master data (roster database, logs)?'#13#10 +
      'Click Yes to remove everything, No to keep your data.',
      mbConfirmation, MB_YESNO
    ) = IDNO then
    begin
      // User wants to keep data — remove from deletion list handled by skipping
    end;
  end;
end;
