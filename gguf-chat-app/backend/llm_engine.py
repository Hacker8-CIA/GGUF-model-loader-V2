"""
Thin wrapper around llama-cpp-python giving:
  - load / unload of arbitrary .gguf files
  - auto chat-template detection (with manual override)
  - streaming generation with a cooperative stop flag
"""
import os
import threading
import time

from llama_cpp import Llama

CHAT_FORMATS = [
    "auto",       # let llama-cpp-python read the template baked into the GGUF
    "chatml",
    "llama-2",
    "llama-3",
    "mistral-instruct",
    "vicuna",
    "alpaca",
    "gemma",
    "phi3",
    "zephyr",
    "openchat",
]


class ModelState:
    def __init__(self):
        self.llm: Llama | None = None
        self.path: str | None = None
        self.meta: dict = {}
        self.lock = threading.Lock()
        self.stop_flag = threading.Event()

    # ---------------------------------------------------------------- load
    def load(self, path: str, n_ctx: int, n_gpu_layers: int, chat_format: str, n_threads: int | None):
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        if not path.lower().endswith(".gguf"):
            raise ValueError("Not a .gguf file")

        with self.lock:
            # free the previous model first
            self.llm = None

            kwargs = dict(
                model_path=path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                verbose=False,
            )
            if n_threads:
                kwargs["n_threads"] = n_threads
            if chat_format and chat_format != "auto":
                kwargs["chat_format"] = chat_format

            start = time.time()
            self.llm = Llama(**kwargs)
            load_seconds = round(time.time() - start, 2)

            self.path = path
            size_bytes = os.path.getsize(path)
            self.meta = {
                "name": os.path.basename(path),
                "path": path,
                "size_mb": round(size_bytes / (1024 * 1024), 1),
                "n_ctx": n_ctx,
                "n_gpu_layers": n_gpu_layers,
                "chat_format": chat_format,
                "load_seconds": load_seconds,
                "detected_chat_format": getattr(self.llm, "chat_format", None),
            }
            return self.meta

    def unload(self):
        with self.lock:
            self.llm = None
            self.path = None
            self.meta = {}

    def is_loaded(self):
        return self.llm is not None

    # ----------------------------------------------------------- generate
    @staticmethod
    def _drop_system_role(messages):
        """Fold any system message(s) into the first user turn instead of
        sending a separate 'system' role — some chat templates (Gemma and
        a few others) reject that role outright."""
        sys_texts = [m["content"] for m in messages if m.get("role") == "system"]
        rest = [m for m in messages if m.get("role") != "system"]
        if not sys_texts:
            return rest
        preamble = "\n\n".join(sys_texts)
        if rest and rest[0].get("role") == "user":
            merged = dict(rest[0])
            merged["content"] = f"{preamble}\n\n{merged['content']}"
            return [merged] + rest[1:]
        return [{"role": "user", "content": preamble}] + rest

    def _open_stream(self, messages, temperature, top_p, top_k, max_tokens, repeat_penalty):
        """Start the completion stream, retrying once with the system role
        folded in if the chat template rejects it. Returns an iterator of
        chunks with the first chunk already validated."""
        def start(msgs):
            s = self.llm.create_chat_completion(
                messages=msgs,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                max_tokens=max_tokens,
                repeat_penalty=repeat_penalty,
                stream=True,
            )
            first = next(s)  # forces template rendering now, not on first iterate

            def chained():
                yield first
                yield from s

            return chained()

        try:
            return start(messages)
        except StopIteration:
            return iter(())
        except Exception as e:  # noqa: BLE001
            text = str(e).lower()
            if "system role" in text or ("system" in text and "not supported" in text):
                fallback = self._drop_system_role(messages)
                try:
                    return start(fallback)
                except StopIteration:
                    return iter(())
            raise

    def stream_chat(self, messages, temperature, top_p, top_k, max_tokens, repeat_penalty):
        """Yield text chunks. Stops early if stop_flag is set."""
        if self.llm is None:
            raise RuntimeError("No model loaded")

        self.stop_flag.clear()
        stream = self._open_stream(messages, temperature, top_p, top_k, max_tokens, repeat_penalty)
        for chunk in stream:
            if self.stop_flag.is_set():
                break
            delta = chunk["choices"][0]["delta"]
            piece = delta.get("content")
            if piece:
                yield piece

    def stop(self):
        self.stop_flag.set()


state = ModelState()
