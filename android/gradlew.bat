@echo off
setlocal

set APP_HOME=%~dp0

"%APP_HOME%\gradle\wrapper\gradle-wrapper.bat" %*

endlocal
