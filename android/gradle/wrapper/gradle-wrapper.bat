@echo off
setlocal

set APP_HOME=%~dp0
set GRADLE_VERSION=8.7
set GRADLE_DIST=gradle-%GRADLE_VERSION%-bin.zip
set GRADLE_URL=https://services.gradle.org/distributions/%GRADLE_DIST%
set GRADLE_DIR=%APP_HOME%..\..\.gradle\gradle-%GRADLE_VERSION%

if not exist "%GRADLE_DIR%\bin\gradle.bat" (
  if not exist "%APP_HOME%..\..\.gradle" mkdir "%APP_HOME%..\..\.gradle"
  powershell -Command "Invoke-WebRequest -Uri %GRADLE_URL% -OutFile %APP_HOME%..\..\.gradle\%GRADLE_DIST%"
  powershell -Command "Expand-Archive -Path %APP_HOME%..\..\.gradle\%GRADLE_DIST% -DestinationPath %APP_HOME%..\..\.gradle"
)

call "%GRADLE_DIR%\bin\gradle.bat" %*

endlocal
