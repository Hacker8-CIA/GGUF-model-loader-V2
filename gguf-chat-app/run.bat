@echo off
if not exist ".venv" (
  echo Please run setup.bat first.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python main.py
pause
