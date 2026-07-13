import json
import os
import traceback

from flask import Flask, Response, jsonify, request, send_from_directory

from .llm_engine import state, CHAT_FORMATS

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")


def set_model_path_callback(*_args, **_kwargs):
    # placeholder hook kept for main.py import compatibility
    pass


# --------------------------------------------------------------------- UI
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


# ---------------------------------------------------------------- meta api
@app.route("/api/chat_formats")
def chat_formats():
    return jsonify(CHAT_FORMATS)


@app.route("/api/status")
def status():
    return jsonify({"loaded": state.is_loaded(), "meta": state.meta})


# --------------------------------------------------------------- model api
@app.route("/api/load_model", methods=["POST"])
def load_model():
    data = request.get_json(force=True)
    path = data.get("path", "")
    n_ctx = int(data.get("n_ctx", 4096))
    n_gpu_layers = int(data.get("n_gpu_layers", -1))
    chat_format = data.get("chat_format", "auto")
    n_threads = data.get("n_threads")
    n_threads = int(n_threads) if n_threads else None

    try:
        meta = state.load(path, n_ctx, n_gpu_layers, chat_format, n_threads)
        return jsonify({"ok": True, "meta": meta})
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/api/unload_model", methods=["POST"])
def unload_model():
    state.unload()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- chat api
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)
    messages = data.get("messages", [])
    params = data.get("params", {})

    temperature = float(params.get("temperature", 0.8))
    top_p = float(params.get("top_p", 0.95))
    top_k = int(params.get("top_k", 40))
    max_tokens = int(params.get("max_tokens", 512))
    repeat_penalty = float(params.get("repeat_penalty", 1.1))

    if not state.is_loaded():
        return jsonify({"ok": False, "error": "No model loaded"}), 400

    def generate():
        try:
            for piece in state.stream_chat(
                messages, temperature, top_p, top_k, max_tokens, repeat_penalty
            ):
                yield f"data: {json.dumps({'token': piece})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


@app.route("/api/stop", methods=["POST"])
def stop():
    state.stop()
    return jsonify({"ok": True})
