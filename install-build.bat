@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "EXIT_CODE=0"

rem ---- ANSI colors (rendered by Windows Terminal / Win10+ consoles) ----
for /f "delims=" %%e in ('echo prompt $E^| cmd') do set "ESC=%%e"
set "C_INFO=%ESC%[96m"
set "C_OK=%ESC%[92m"
set "C_WARN=%ESC%[93m"
set "C_ERR=%ESC%[91m"
set "C_DIM=%ESC%[90m"
set "C_RST=%ESC%[0m"
set "LINE============================================================="

set "PKG_VER="
if exist "VERSION" set /p PKG_VER=<VERSION
call :tick T0

where node >nul 2>&1
if errorlevel 1 (
  call :err "node not found. Please install Node.js first."
  set "EXIT_CODE=1"
  goto end
)
where npm >nul 2>&1
if errorlevel 1 (
  call :err "npm not found. Please install Node.js first."
  set "EXIT_CODE=1"
  goto end
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
for /f "delims=" %%v in ('npm -v') do set "NPM_VER=%%v"

echo.
echo %C_INFO%%LINE%%C_RST%
echo %C_INFO%   MKbot install + build%C_RST%%C_DIM%   v%PKG_VER%%C_RST%
echo %C_DIM%   node %NODE_VER%   npm %NPM_VER%   %DATE% %TIME: =0%%C_RST%
echo %C_INFO%%LINE%%C_RST%

rem Sharp may download large @img/sharp-win32-x64 packages; raise timeout (ms).
rem Session-only env var: does NOT touch the global npm config.
set "npm_config_fetch_timeout=600000"

call :step 1 3 "npm install"
call npm install --no-audit --no-fund
if errorlevel 1 (
  set "EXIT_CODE=1"
  call :err "npm install failed, build skipped"
  call :warn "If stuck on sharp / @img/sharp-win32-x64, try mirror:"
  echo         npm config set registry https://registry.npmmirror.com
  goto end
)

call :step 2 3 "npm run build"
call npm run build
if errorlevel 1 (
  set "EXIT_CODE=1"
  call :err "npm run build failed"
  goto end
)

call :step 3 3 "pack kakake-plugin-mkbot into zip"
set "ZIP_BASE=kakake-plugin-mkbot"
if defined PKG_VER (
  set "ZIP_NAME=%ZIP_BASE%-%PKG_VER%.zip"
) else (
  set "ZIP_NAME=%ZIP_BASE%.zip"
  call :warn "VERSION missing, zip name has no version suffix"
)
if exist "%ZIP_NAME%" del /q "%ZIP_NAME%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '.\kakake-plugin-mkbot' -DestinationPath '%ZIP_NAME%' -Force"
if errorlevel 1 (
  set "EXIT_CODE=1"
  call :err "zip packaging failed"
  goto end
)
set "ZIP_MB="
for /f "delims=" %%s in ('powershell -NoProfile -Command "[math]::Round((Get-Item -LiteralPath '%ZIP_NAME%').Length/1MB,1)"') do set "ZIP_MB=%%s"

call :tick T1
set /a E_CS=T1-T0
if %E_CS% lss 0 set /a E_CS+=86400000
set /a E_MIN=E_CS/60000, E_SEC=E_CS/100-(E_MIN*60)

echo.
if "%EXIT_CODE%"=="0" (
  echo %C_OK%%LINE%
  echo    BUILD OK   elapsed %E_MIN% min %E_SEC% s
  echo    folder : kakake-plugin-mkbot\
  if defined ZIP_MB (
    echo    zip    : %ZIP_NAME%  [%ZIP_MB% MB]
  ) else (
    echo    zip    : %ZIP_NAME%
  )
  echo %LINE%%C_RST%
) else (
  echo %C_ERR%%LINE%
  echo    BUILD FAILED - see error above
  echo %LINE%%C_RST%
)
echo.
pause
endlocal & exit /b %EXIT_CODE%

rem ---- helpers ----

:step  --  %1=current step, %2=total, %3=title
echo.
echo %C_INFO%[%~1/%~2]%C_RST% %~3   %C_DIM%[%TIME: =0%]%C_RST%
goto :eof

:err  --  red error line
echo %C_ERR%[ERROR]%C_RST% %~1
goto :eof

:warn  --  yellow warning line
echo %C_WARN%[WARN]%C_RST% %~1
goto :eof

:tick  --  set var %1 to current time in centiseconds (locale-proof)
set "t=%TIME: =0%"
for /f "tokens=1-4 delims=:., " %%a in ("%t%") do set /a %~1=(1%%a-100)*360000+(1%%b-100)*6000+(1%%c-100)*100+(1%%d-100)
goto :eof
