"""
GGUF Chat — a local desktop app to chat with any .gguf model.

Run with:  python main.py
"""
import threading
import time
import webview
from backend.server import app, set_model_path_callback

HOST = "127.0.0.1"
PORT = 5432


class Api:
    """Methods exposed to the JS frontend as window.pywebview.api.*"""

    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def pick_gguf_file(self):
        """Open a native file dialog restricted to .gguf files."""
        if self._window is None:
            return None
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("GGUF Models (*.gguf)", "All files (*.*)"),
        )
        if result and len(result) > 0:
            return result[0]
        return None

    def pick_folder_and_list_gguf(self):
        """Open a folder dialog and return every .gguf file found inside it."""
        import os

        if self._window is None:
            return []
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if not result:
            return []
        folder = result[0]
        found = []
        for root, _, files in os.walk(folder):
            for f in files:
                if f.lower().endswith(".gguf"):
                    found.append(os.path.join(root, f))
        return found


def run_server():
    app.run(host=HOST, port=PORT, threaded=True, use_reloader=False)


def main():
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(0.6)  # give Flask a moment to bind

    api = Api()
    window = webview.create_window(
        "GGUF Chat",
        f"http://{HOST}:{PORT}/",
        js_api=api,
        width=1360,
        height=860,
        min_size=(980, 640),
        background_color="#0b0b12",
    )
    api.set_window(window)
    webview.start()


if __name__ == "__main__":
    main()
