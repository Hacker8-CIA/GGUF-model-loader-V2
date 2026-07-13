# GGUF Chat

A simple desktop app: load any `.gguf` model file, chat with it by typing or
by voice, fully offline. Cool glowing UI included.

## Setup (do this once)

**Windows:**
1. Double-click `setup.bat`.
   - If it can't find a compatible Python, it will tell you to install
     Python 3.12 from python.org, then run `setup.bat` again.
2. Wait for "Setup complete!"

**Mac / Linux:**
1. Open a terminal in this folder and run: `./setup.sh`
2. Wait for "Setup complete!"

## Run

**Windows:** double-click `run.bat`
**Mac / Linux:** run `./run.sh`

A window opens. Click **Load .gguf model**, pick any GGUF file on your
computer, and start chatting — by typing or by clicking the mic button.

## What you get

- Loads any `.gguf` model (Llama, Mistral, Qwen, Gemma, Phi, etc.)
- Streaming replies, glowing chat bubbles, animated background
- Voice input (click the mic, speak, it fills the text box)
- 4 themes — click the swirl icon in the top bar to cycle through them

## If something goes wrong during setup

The most common issue is `llama-cpp-python` failing to install because it
tried to compile from source instead of using a ready-made version. The
setup script avoids this by installing Python 3.12 (if available) and
pulling a pre-built version — no compiler needed. If setup still fails,
copy the error message from the window and ask for help with it.
