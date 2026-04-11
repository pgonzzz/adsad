' ============================================================
' start-agent.vbs — Wrapper silencioso para ejecutar el agente
' en Windows sin mostrar una ventana de consola.
'
' El Task Scheduler de Windows invoca este fichero al arrancar
' el PC. Se ejecuta en segundo plano (sin ventana visible) y
' lanza "npm start" en la carpeta agent/.
' ============================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ruta absoluta del directorio donde está este .vbs
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Comando: cd a agent/ y ejecuta npm start (0 = sin ventana, False = no esperar)
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c npm start", 0, False
