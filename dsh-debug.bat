@echo off
rem ============================================================================
rem dsh-debug.bat - DSH Desktop Shell startup troubleshooting toolbox
rem
rem   Handles two kinds of startup problems:
rem     1) Port 3080 occupied  -> detect -> confirm -> kill the process tree
rem     2) Plugins breaking dsh startup -> step-by-step checks
rem        (config tree / plugin layers / patch files / logs / environment)
rem
rem   Usage: double-click, or from a terminal:  dsh-debug.bat [port|plugins|logs|env|all]
rem   Everything is shown first, then confirmed. Nothing is killed or changed
rem   without your explicit yes.
rem ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ---------- [config] ----------
rem read DSH_PROJECT_DIR from local-config.js (or env DSH_PROJECT_DIR_OVERRIDE)
set "DSH_PROJECT_DIR="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_get-project-dir.ps1" 2^>nul`) do set "DSH_PROJECT_DIR=%%P"
if not defined DSH_PROJECT_DIR set "DSH_PROJECT_DIR=D:\DeepSeekHarness\deepseek-harness"
goto :after_config

:after_config

rem ---------- [paths & constants] ----------
set "DSH_HOME_DIR=%USERPROFILE%\.dsh"
set "PROFILE_DIR=%DSH_HOME_DIR%\profiles\web"
set "SHELL_LOG=%APPDATA%\dsh-desktop-shell\dsh-shell.log"
set "PORT=3080"

rem desktop shell fast-launch artifacts (same as main.js)
set "BUILT_LAUNCHER=%DSH_PROJECT_DIR%\apps\cli\lib\bin.js"
set "WEB_BUNDLE=%DSH_PROJECT_DIR%\apps\web\dist\index.html"

rem ---------- [command-line shortcuts] ----------
rem dsh-debug.bat port|plugins|logs|env|config|all  (each runs one check then exits)
set "NO_PAUSE=1"
if /i "%~1"=="port"    call :check_port & exit /b
if /i "%~1"=="plugins" call :check_plugins & exit /b
if /i "%~1"=="logs"    call :check_logs & exit /b
if /i "%~1"=="env"     call :check_env & exit /b
if /i "%~1"=="config"  call :check_config & exit /b
if /i "%~1"=="all"     call :check_all & exit /b
set "NO_PAUSE="
goto :menu

rem ---------- [helpers] ----------
:say
    echo [dsh-debug] %*
    exit /b

:sep
    echo.
    echo ------------------------------------------------------------------
    exit /b

:pause_key
    if defined NO_PAUSE exit /b
    echo.
    set /p "=Press any key to continue..." <nul
    set /p "=" 
    exit /b

rem ---------- [command-line shortcuts] ----------
rem dsh-debug.bat port|plugins|logs|env|all  (each runs one check then exits)
if /i "%~1"=="port"    call :check_port & exit /b
if /i "%~1"=="plugins" call :check_plugins & exit /b
if /i "%~1"=="logs"    call :check_logs & exit /b
if /i "%~1"=="env"     call :check_env & exit /b
if /i "%~1"=="all"     call :check_all & exit /b

rem ---------- [main menu] ----------
:menu
    cls
    echo.
    echo  ==========================================================
    echo    DSH Desktop Shell startup toolbox  (dsh-debug)
    echo  ==========================================================
    echo    Project dir : %DSH_PROJECT_DIR%
    echo    Profile     : %PROFILE_DIR%
    echo    Service port: %PORT%
    echo  ----------------------------------------------------------
    echo    [1] Detect and clean up port %PORT% - kill the occupying process
    echo    [2] Check dsh config tree and plugin layers - dump-config
    echo    [3] Check plugin install state and patch files
    echo    [4] View desktop shell log - dsh-shell.log
    echo    [5] Environment self-check - node / pnpm / dsh / dirs
    echo    [6] Full run-through - 1 2 3 5 in order
    echo    [0] Exit
    echo  ----------------------------------------------------------
    set "CHOICE="
    set /p "CHOICE=Your choice: "
    if "%CHOICE%"=="" exit /b

    if "%CHOICE%"=="1" call :check_port & goto :menu
    if "%CHOICE%"=="2" call :check_config & goto :menu
    if "%CHOICE%"=="3" call :check_plugins & goto :menu
    if "%CHOICE%"=="4" call :check_logs & goto :menu
    if "%CHOICE%"=="5" call :check_env & goto :menu
    if "%CHOICE%"=="6" call :check_all & goto :menu
    if "%CHOICE%"=="0" exit /b
    goto :menu

rem ============================================================================
rem [1] detect & clean port 3080
rem ============================================================================
:check_port
    cls
    call :sep
    call :say Checking what listens on port %PORT% ...
    call :sep

    netstat -ano | findstr ":%PORT%" | findstr "LISTENING" > "%TEMP%\_dsh_port.txt" 2>nul
    if not exist "%TEMP%\_dsh_port.txt" (
        call :say Port %PORT% is currently free.
        call :pause_key
        exit /b
    )

    set "FOUND=0"
    echo   LISTENING connections on port %PORT%:
    echo.
    type "%TEMP%\_dsh_port.txt"
    echo.

    for /f "tokens=5" %%P in (%TEMP%\_dsh_port.txt) do (
        if not "%%P"=="" (
            set "FOUND=1"
            call :inspect_pid %%P
        )
    )
    del "%TEMP%\_dsh_port.txt" >nul 2>&1

    if "%FOUND%"=="0" (
        call :say No listener found on port %PORT%.
    )
    call :pause_key
    exit /b

:inspect_pid
    set "PID=%~1"
    echo.
    echo   ----------------------------------------------------------
    echo   Process PID=%PID% is listening on port %PORT%
    tasklist /FI "PID eq %PID%" 2>nul
    echo.
    echo   Command line - to confirm it is the dsh web / node service:
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=%PID%' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine" 2>nul
    echo   ----------------------------------------------------------
    echo.
    set /p "KILL_CONFIRM=Kill process %PID% and its child processes? [y/N]: "
    if /i "%KILL_CONFIRM%"=="y" (
        echo.
        call :say Killing process %PID% and its whole tree ...
        taskkill /PID %PID% /T /F
        echo.
        call :say Kill command issued. Re-checking port:
        netstat -ano | findstr ":%PORT%" | findstr "LISTENING" || call :say Port %PORT% is free now
    ) else (
        call :say Skipped - nothing was killed.
    )
    exit /b

rem ============================================================================
rem [2] check dsh config tree & plugin layers
rem ============================================================================
:check_config
    cls
    call :sep
    call :say Composing the web profile config tree - read-only, no server start ...
    call :sep

    if not exist "%PROFILE_DIR%\package.json" (
        call :say [ERROR] Profile not found: %PROFILE_DIR%
        call :say         Check DSH_HOME, or run the desktop shell / dsh once to initialize.
        call :pause_key
        exit /b
    )

    echo   [A] Full config tree - user layer cordis.patch.yml plus plugin patch layers
    echo       command: dsh --profile web --dump-config
    echo.
    call :run_dsh dump-config

    echo.
    echo   [B] Bundle layers only - skips the user layer; tells you whether the
    echo       problem is in YOUR patch file or in a PLUGIN patch
    echo       command: dsh --profile web --dump-default-config
    echo.
    call :run_dsh dump-default-config

    call :sep
    call :say How to read the output:
    call :say   - A fails, B succeeds : problem is in your cordis.patch.yml or a plugin patch layer
    call :say   - A and B both fail  : usually a broken plugin package / missing deps; go to [3]
    call :say   - Both succeed but still won't start: see [4] log and [5] environment
    call :pause_key
    exit /b

:run_dsh
    where dsh >nul 2>&1
    if errorlevel 1 (
        call :say [ERROR] dsh is not on PATH. Install it first:  npm install -g @deepseek-ai/dsh
        exit /b 1
    )
    call dsh --profile web --%1
    exit /b

rem ============================================================================
rem [3] plugin install state & patch files
rem ============================================================================
:check_plugins
    cls
    call :sep
    call :say Checking plugin install state and patch files ...
    call :sep

    rem 3.1 profile package.json deps & bundle layers
    echo   [A] profile dependencies and bundle layers - package.json
    if exist "%PROFILE_DIR%\package.json" (
        type "%PROFILE_DIR%\package.json"
    ) else (
        call :say [ERROR] missing %PROFILE_DIR%\package.json
    )
    call :sep

    rem 3.2 user patch layer
    echo   [B] user patch layer cordis.patch.yml
    if exist "%PROFILE_DIR%\cordis.patch.yml" (
        type "%PROFILE_DIR%\cordis.patch.yml"
    ) else (
        call :say -no cordis.patch.yml - that is fine-
    )
    call :sep

    rem 3.3 local plugin dirs exist? file: refs break when a dir is moved
    echo   [C] local plugin directory existence check
    if exist "%PROFILE_DIR%\plugins" (
        for /d %%D in ("%PROFILE_DIR%\plugins\*") do (
            if exist "%%D\package.json" (
                call :say   OK    %%D
            ) else (
                call :say   [BROKEN] %%D is missing package.json
            )
        )
    ) else (
        call :say   -no plugins directory under the profile-
    )

    rem 3.4 pnpm install integrity
    echo.
    echo   [D] pnpm install integrity - node_modules vs declarations
    if exist "%PROFILE_DIR%\node_modules" (
        call :say   node_modules exists
        if exist "%PROFILE_DIR%\pnpm-lock.yaml" call :say   pnpm-lock.yaml exists
        call :say   If you suspect missing deps, run in the profile dir:  pnpm install
    ) else (
        call :say   [ERROR] node_modules missing - plugins/deps not installed; run in %PROFILE_DIR%:  pnpm install
    )

    rem 3.5 installed plugin list
    echo.
    echo   [E] installed plugins - pnpm list --depth 0
    if exist "%PROFILE_DIR%\package.json" (
        pushd "%PROFILE_DIR%"
        call pnpm list --depth 0 2>nul
        popd
    )

    call :sep
    call :say Common plugin startup problems:
    call :say   1. file: local plugin dir moved/deleted - reinstall or fix package.json path
    call :say   2. pnpm blocks build scripts - in the profile dir:  pnpm approve-builds --all
    call :say   3. plugin patch YAML syntax error - use [2]B output to locate the layer
    call :say   4. version incompatibility - dsh plugin --profile web update pkg-name
    call :pause_key
    exit /b

rem ============================================================================
rem [4] view desktop shell log
rem ============================================================================
:check_logs
    cls
    call :sep
    call :say Desktop shell log: %SHELL_LOG%
    call :sep
    if exist "%SHELL_LOG%" (
        powershell -NoProfile -Command "Get-Content -LiteralPath '%SHELL_LOG%' -Tail 80"
    ) else (
        call :say Log file does not exist - shell may not have run yet, or userData lives elsewhere.
    )
    call :sep
    call :say Tip: the log includes the dsh child process stdout/stderr and error summaries.
    call :pause_key
    exit /b

rem ============================================================================
rem [5] environment self-check
rem ============================================================================
:check_env
    cls
    call :sep
    call :say Environment self-check ...
    call :sep

    echo   [A] toolchain
    set "NODE_OK=" & set "PNPM_OK=" & set "DSH_OK="
    node --version >nul 2>&1 && set "NODE_OK=1"
    call pnpm --version >nul 2>&1 && set "PNPM_OK=1"
    where dsh >nul 2>&1 && set "DSH_OK=1"
    if defined NODE_OK (echo       node : OK) else (echo       node : [MISSING] install Node.js 20+)
    node --version 2>nul
    if defined PNPM_OK (echo       pnpm : OK) else (echo       pnpm : [MISSING] install pnpm)
    if defined DSH_OK (echo       dsh  : OK) else (echo       dsh  : [MISSING] run npm install -g @deepseek-ai/dsh)
    call dsh --version 2>nul
    call :sep

    echo   [B] DSH project dir
    if exist "%DSH_PROJECT_DIR%" (
        echo       %DSH_PROJECT_DIR% exists
    ) else (
        echo       [ERROR] %DSH_PROJECT_DIR% does not exist - check local-config.js / DSH_PROJECT_DIR
    )
    if exist "%BUILT_LAUNCHER%" (
        echo       fast launcher apps\cli\lib\bin.js exists - node fast path
    ) else (
        echo       fast launcher missing - will fall back to pnpm dsh web
    )
    if exist "%WEB_BUNDLE%" (
        echo       web frontend apps\web\dist\index.html exists
    ) else (
        echo       [WARNING] web frontend missing - run pnpm run build in %DSH_PROJECT_DIR%
    )
    call :sep

    echo   [C] DSH_HOME and profile
    echo       DSH_HOME : %DSH_HOME_DIR%
    if exist "%PROFILE_DIR%" (
        echo       profile  : %PROFILE_DIR% exists
    ) else (
        echo       [ERROR] profile dir missing - first dsh run initializes it
    )
    call :sep

    echo   [D] port 3080
    netstat -ano | findstr ":3080" | findstr "LISTENING" >nul 2>&1 && (
        echo       3080 currently occupied - use menu [1] to clean up
    ) || (
        echo       3080 is free
    )
    call :pause_key
    exit /b

rem ============================================================================
rem [6] full run-through
rem ============================================================================
:check_all
    call :check_port
    call :check_env
    call :check_config
    call :check_plugins
    call :check_logs
    exit /b