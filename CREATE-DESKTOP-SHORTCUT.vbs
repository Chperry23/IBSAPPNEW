Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Desktop") & "\ECI Cabinet PM.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
    oLink.TargetPath = WScript.ScriptFullName
    oLink.Arguments = ""
    oLink.Description = "ECI Cabinet PM Application"
    oLink.IconLocation = "%SystemRoot%\System32\SHELL32.dll,21"
    oLink.WorkingDirectory = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
    oLink.TargetPath = oLink.WorkingDirectory & "\START-CABINET-PM.bat"
oLink.Save

MsgBox "Desktop shortcut created!" & vbCrLf & vbCrLf & "You can now launch Cabinet PM from your desktop.", vbInformation, "ECI Cabinet PM"
