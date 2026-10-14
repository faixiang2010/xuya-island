' launch-update-progress.vbs
' Hidden relay that starts the PowerShell update-progress window without any
' console (black window) flash.
'
' Why VBS instead of `cmd /c start powershell ...`:
'   - `cmd /c start` allocates a conhost/console through cmd's start builtin,
'     so a black terminal flashes before the window appears (windowsHide only
'     hides the directly-spawned cmd.exe, not the console start creates).
'   - Spawning powershell.exe directly with `detached` strips its console and
'     PowerShell exits before running the script; without `detached` the window
'     is not guaranteed to outlive Electron's app.quit().
'   - wscript.exe is a GUI-subsystem host (no console at all), and
'     WshShell.Run(cmd, 0, False) starts PowerShell hidden and returns at once,
'     so PowerShell keeps running after this relay and Electron main exit.
'
' This file is intentionally ASCII-only. wscript.exe reads .vbs using the
' system ANSI code page, so non-ASCII source bytes could be mis-parsed. All
' user-visible Chinese text is passed from the main process as argv (UTF-16),
' which survives the relay unchanged.
'
' Usage (spawned by update.cts):
'   wscript.exe launch-update-progress.vbs <ps1Path> [powershell args...]
' Arg 0 is the .ps1 path; the remaining args are forwarded verbatim to
' powershell.exe -File <ps1Path> <args...>.

Option Explicit

Dim shell, args, i, ps1Path, forwarded, cmd

If WScript.Arguments.Count < 1 Then
    ' Nothing to launch; the window is a non-critical UX enhancement, so
    ' silently do nothing rather than surfacing an error.
    WScript.Quit 0
End If

Set shell = CreateObject("WScript.Shell")
Set args = WScript.Arguments

ps1Path = args(0)

' Rebuild the forwarded argument list, quoting each so paths/messages with
' spaces survive. Skip arg 0 (the .ps1 path, handled via -File below).
forwarded = ""
For i = 1 To args.Count - 1
    forwarded = forwarded & " " & Quote(args(i))
Next

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " _
    & Quote(ps1Path) & forwarded

' 0 = hidden window, False = do not wait (return immediately so PowerShell
' keeps running after this relay and the Electron main process exit).
shell.Run cmd, 0, False

WScript.Quit 0

' Wrap a value in double quotes, escaping embedded double quotes by doubling
' them (VBScript/command-line convention).
Function Quote(value)
    Quote = """" & Replace(value, """", """""") & """"
End Function
