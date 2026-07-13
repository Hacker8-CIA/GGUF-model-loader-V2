@echo off
setlocal enabledelayedexpansion
echo ============================================
echo   GGUF Chat - Setup
echo ============================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo Could not find the Python launcher "py" on this computer.
  echo.
  echo Please install Python 3.12 from:
  echo   https://www.python.org/downloads/release/python-3120/
  echo During install, make sure to check "Add python.exe to PATH".
  echo Then run this setup.bat again.
  pause
  exit /b 1
)

set PYVER=
for %%v in (3.12 3.11 3.10) do (
  if "!PYVER!"=="" (
    py -%%v -c "pass" >nul 2>nul
    if not errorlevel 1 set PYVER=%%v
  )
)

if "%PYVER%"=="" (
  echo.
  echo GGUF Chat needs Python 3.10, 3.11, or 3.12 installed to set up
  echo without a C++ compiler. Only newer/other versions were found.
  echo.
  echo Please install Python 3.12 from:
  echo   https://www.python.org/downloads/release/python-3120/
  echo Then run this setup.bat again.
  pause
  exit /b 1
)

echo Using Python %PYVER%
echo.

if not exist ".venv" (
  echo Creating virtual environment...
  py -%PYVER% -m venv .venv
)

call .venv\Scripts\activate.bat

echo.
echo Installing packages, this can take a few minutes...
python -m pip install --upgrade pip >nul
pip install flask pywebview
if errorlevel 1 goto :fail

pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   Setup complete!
echo   Double-click run.bat to start GGUF Chat.
echo ============================================
pause
exit /b 0

:fail
echo.
echo ============================================
echo   Something failed during install.
echo   Copy the error above and ask for help.
echo ============================================
pause
exit /b 1
