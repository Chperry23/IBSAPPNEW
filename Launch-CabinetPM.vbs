' Start Cabinet PM with no console window. Logs still go to logs\ next to the exe.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run """" & dir & "\CabinetPM.exe""", 0, False
