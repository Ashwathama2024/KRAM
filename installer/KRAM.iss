; KRAM - Kartavya Roster & App Management
; Inno Setup 6 Installer Script
;
; Produces:  installer/Output/KRAM-Setup.exe
;
; To compile:
;   1. Install Inno Setup 6:  https://jrsoftware.org/isdl.php
;   2. Open this file in Inno Setup IDE and press F9
;      OR run: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\KRAM.iss

; ── App metadata ──────────────────────────────────────────────────────────────
#define AppName      "KRAM"
#define AppVersion   "1.0.0"
#define AppPublisher "Kartavya Development"
#define AppExe       "KRAM.exe"
#define AppDesc      "Kartavya Roster & App Management"
#define SourceDir    "..\release\KRAM"

[Setup]
; Unique installer GUID - never reuse across different apps
AppId={{A7F2D4E1-3C8B-4F6A-9D0E-2B1C5A8F3E7D}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppComments={#AppDesc}

; 64-bit install - goes to C:\Program Files\KRAM (not x86)
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

; Install location
DefaultDirName={autopf64}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes

; Output
OutputDir=Output
OutputBaseFilename=KRAM-Setup
SetupIconFile=icon.ico

; Wizard appearance
WizardStyle=modern
WizardResizable=no
WizardImageFile=wizard.bmp
WizardSmallImageFile=wizard_sm.bmp

; Compression (best ratio, slower build)
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; Windows requirement
MinVersion=10.0
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Uninstaller
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
CreateUninstallRegKey=yes

; Prevent running multiple instances of the installer
AppMutex=KRAMInstallerMutex

; Close KRAM if running before install (prevents "file in use" errors)
CloseApplications=yes
CloseApplicationsFilter=KRAM.exe
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
; Customize installer text
WelcomeLabel1=Welcome to [name] Setup
WelcomeLabel2=This will install [name/ver] on your computer.%n%nKRAM is a professional duty roster management system for your organization.%n%nClick Next to continue.
FinishedHeadingLabel=Setup Complete
FinishedLabel=KRAM has been installed successfully.%n%nClick Finish to close this window.%nLaunch KRAM to begin setting up your organization.

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut";  GroupDescription: "Shortcuts:"
Name: "startupicon"; Description: "Launch KRAM when &Windows starts"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
; All application files from PyInstaller build
Source: "{#SourceDir}\{#AppExe}";   DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExe}"; Comment: "{#AppDesc}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

; Desktop shortcut (optional - checked by default)
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Comment: "{#AppDesc}"; Tasks: desktopicon

; Windows startup (optional - unchecked by default)
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: startupicon

[Run]
; Offer to launch KRAM after install
Filename: "{app}\{#AppExe}"; \
    Description: "Launch {#AppName} now"; \
    Flags: nowait postinstall skipifsilent

[Registry]
; Register in Windows App list with publisher info
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#AppExe}"; \
    ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExe}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\KartavyaDevelopment\KRAM"; \
    ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\KartavyaDevelopment\KRAM"; \
    ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"; Flags: uninsdeletekey

[Code]
// ── Uninstall: ask user about their data ─────────────────────────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  AppDataPath: String;
  Answer: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    AppDataPath := ExpandConstant('{userappdata}\KRAM');
    if DirExists(AppDataPath) then
    begin
      Answer := MsgBox(
        'KRAM found your roster database at:'#13#10 +
        AppDataPath + #13#10#13#10 +
        'Do you want to DELETE your roster data (database, logs)?'#13#10 +
        'Click NO to keep your data (recommended).',
        mbConfirmation, MB_YESNO or MB_DEFBUTTON2
      );
      if Answer = IDYES then
      begin
        DelTree(AppDataPath, True, True, True);
      end;
    end;
  end;
end;

// ── Check for previous version on install ────────────────────────────────────
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
