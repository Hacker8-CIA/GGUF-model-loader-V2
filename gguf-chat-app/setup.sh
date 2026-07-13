#!/usr/bin/env bash
set -e
echo "============================================"
echo "  GGUF Chat - Setup"
echo "============================================"

PYVER=""
for v in 3.12 3.11 3.10; do
  if command -v "python$v" >/dev/null 2>&1; then
    PYVER="$v"
    break
  fi
done

if [ -z "$PYVER" ]; then
  echo "GGUF Chat needs Python 3.10, 3.11, or 3.12 installed."
  echo "Install one (e.g. 'brew install python@3.12' on macOS,"
  echo "or 'sudo apt install python3.12' on Ubuntu) and re-run this script."
  exit 1
fi

echo "Using Python $PYVER"
"python$PYVER" -m venv .venv
source .venv/bin/activate

pip install --upgrade pip >/dev/null
pip install flask pywebview

if [ "$(uname)" = "Darwin" ]; then
  pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/metal
else
  pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
  echo "Linux note: pywebview needs a system webview backend:"
  echo "  sudo apt install python3-gi gir1.2-webkit2-4.1"
fi

echo "============================================"
echo "  Setup complete! Run ./run.sh to start."
echo "============================================"
