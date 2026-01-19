@ECHO OFF
REM Phosphorite Launcher for Windows CMD
REM Simply invokes the Node.js bootstrap script

SETLOCAL ENABLEEXTENSIONS
TITLE Phosphorite Launcher

SET SCRIPT_DIR=%~dp0
SET BOOTSTRAP_SCRIPT=%SCRIPT_DIR%scripts\bootstrap.js

REM Check if Node.js is installed
WHERE node >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Node.js is not installed!
    ECHO.
    SET /P INSTALL="Would you like to install it automatically using winget? (Y/N): "
    
    IF /I "%INSTALL%"=="Y" (
        WHERE winget >nul 2>&1
        IF %ERRORLEVEL% NEQ 0 (
            ECHO.
            ECHO Winget not available. Please install Node.js manually from https://nodejs.org
            PAUSE
            EXIT /B 1
        )
        
        ECHO.
        ECHO Installing Node.js LTS...
        winget install --id OpenJS.NodeJS.LTS -e --silent
        
        IF %ERRORLEVEL% EQU 0 (
            ECHO.
            ECHO Node.js installed successfully! Please restart this launcher.
        ) ELSE (
            ECHO.
            ECHO Installation failed. Please install Node.js manually from https://nodejs.org
        )
        
        ECHO.
        PAUSE
        EXIT /B 0
    ) ELSE (
        ECHO.
        ECHO Please install Node.js from https://nodejs.org and try again.
        PAUSE
        EXIT /B 1
    )
)

REM Check if bootstrap.js exists
IF NOT EXIST "%BOOTSTRAP_SCRIPT%" (
    ECHO Error: Could not find bootstrap script at %BOOTSTRAP_SCRIPT%
    PAUSE
    EXIT /B 1
)

REM Launch the bootstrap script
node "%BOOTSTRAP_SCRIPT%"

IF ERRORLEVEL 1 (
    ECHO.
    ECHO The launcher encountered an error.
    PAUSE
)

ENDLOCAL
