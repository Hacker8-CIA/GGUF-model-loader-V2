// ============================================================
// GGUF Chat frontend — simple mode: load model, type or talk.
// ============================================================

const el = (id) => document.getElementById(id);

const THEMES = ["phosphor", "neon", "glacier", "void"];
const DEFAULT_PARAMS = {
  temperature: 0.8,
  top_p: 0.95,
  top_k: 40,
  max_tokens: 512,
  repeat_penalty: 1.1,
};
const SYSTEM_PROMPT = "You are a helpful, concise assistant.";

const state = {
  modelLoaded: false,
  generating: false,
  messages: [],
  waveLevel: 0,
  recognition: null,
  recording: false,
};

// ---------------------------------------------------------- toast
function toast(msg, isError = false) {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => (t.className = "toast"), 3200);
}

// ---------------------------------------------------------- theme
function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", name);
  localStorage.setItem("gguf-chat-theme", name);
}
let themeIndex = Math.max(0, THEMES.indexOf(localStorage.getItem("gguf-chat-theme") || "phosphor"));
applyTheme(THEMES[themeIndex]);

el("btn-theme").addEventListener("click", () => {
  themeIndex = (themeIndex + 1) % THEMES.length;
  applyTheme(THEMES[themeIndex]);
  toast("Theme: " + THEMES[themeIndex]);
});

// ---------------------------------------------------- model loading
el("btn-pick-model").addEventListener("click", async () => {
  if (!window.pywebview) {
    toast("Native file picker unavailable outside the desktop app", true);
    return;
  }
  const path = await window.pywebview.api.pick_gguf_file();
  if (!path) return;
  await loadModel(path);
});

async function loadModel(path) {
  setStatus(false, true, "Loading model…");
  el("btn-pick-model").disabled = true;
  const body = {
    path,
    n_ctx: 4096,
    n_gpu_layers: -1,   // use GPU automatically if available, falls back to CPU
    chat_format: "auto",
    n_threads: null,
  };
  try {
    const res = await fetch("/api/load_model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to load model");
    state.modelLoaded = true;
    const m = data.meta;
    setStatus(true, false, "Ready — " + m.name);
    toggleInput(true);
    toast("Model loaded ✓");
  } catch (e) {
    setStatus(false, false, "Load failed");
    toast(String(e.message || e), true);
  } finally {
    el("btn-pick-model").disabled = false;
  }
}

function setStatus(ready, busy, text) {
  const dot = el("status-dot");
  dot.className = "status-dot" + (busy ? " busy" : ready ? " ready" : "");
  el("brand-dot").className = "dot" + (busy ? " busy" : "");
  el("status-text").textContent = text || (ready ? "Ready" : "No model loaded");
}

function toggleInput(enabled) {
  el("chat-input").disabled = !enabled;
  el("chat-input").placeholder = enabled ? "Say something, or click the mic..." : "Load a model to start chatting...";
  el("btn-send").disabled = !enabled;
  if (enabled) {
    const empty = el("empty-state");
    if (empty) empty.remove();
  }
}

// ---------------------------------------------------- chat send
const chatForm = el("chat-form");
const chatInput = el("chat-input");
const chatLog = el("chat-log");

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || state.generating || !state.modelLoaded) return;
  chatInput.value = "";
  chatInput.style.height = "auto";
  appendMessage("user", text);
  state.messages.push({ role: "user", content: text });
  await sendToModel();
});

el("btn-stop").addEventListener("click", async () => {
  await fetch("/api/stop", { method: "POST" });
});

function appendMessage(role, content) {
  const empty = el("empty-state");
  if (empty) empty.remove();
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  wrap.innerHTML = `<span class="msg-role">${role === "user" ? "you" : "model"}</span><span class="msg-text"></span>`;
  wrap.querySelector(".msg-text").textContent = content;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  return wrap;
}

async function sendToModel() {
  state.generating = true;
  toggleInput(false);
  el("btn-stop").style.display = "inline-block";
  setStatus(true, true, "Generating…");

  const fullMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...state.messages];

  const assistantWrap = appendMessage("assistant", "");
  assistantWrap.classList.add("streaming");
  const textSpan = assistantWrap.querySelector(".msg-text");
  let fullText = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: fullMessages, params: DEFAULT_PARAMS }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.token) {
          fullText += payload.token;
          textSpan.textContent = fullText;
          chatLog.scrollTop = chatLog.scrollHeight;
          pulseWave();
        } else if (payload.error) {
          toast(payload.error, true);
        }
      }
    }
  } catch (err) {
    toast("Generation error: " + err.message, true);
  }

  assistantWrap.classList.remove("streaming");
  state.messages.push({ role: "assistant", content: fullText });
  state.generating = false;
  toggleInput(true);
  el("btn-stop").style.display = "none";
  setStatus(true, false, "Ready");
}

// ---------------------------------------------------- voice input
function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      interim += event.results[i][0].transcript;
    }
    chatInput.value = interim;
    chatInput.dispatchEvent(new Event("input"));
  };
  rec.onend = () => {
    state.recording = false;
    el("btn-mic").classList.remove("recording");
  };
  rec.onerror = () => {
    state.recording = false;
    el("btn-mic").classList.remove("recording");
  };
  return rec;
}
state.recognition = setupSpeechRecognition();

el("btn-mic").addEventListener("click", () => {
  if (!state.modelLoaded) {
    toast("Load a model first", true);
    return;
  }
  if (!state.recognition) {
    toast("Voice input needs a Chromium-based webview (Web Speech API)", true);
    return;
  }
  if (state.recording) {
    state.recognition.stop();
    return;
  }
  state.recording = true;
  el("btn-mic").classList.add("recording");
  state.recognition.start();
});

// ---------------------------------------------------- waveform canvas
const waveCanvas = el("wave-canvas");
const waveCtx = waveCanvas.getContext("2d");
let waveBars = new Array(48).fill(0);

function pulseWave() { state.waveLevel = 1; }

function resizeWaveCanvas() {
  waveCanvas.width = waveCanvas.clientWidth * devicePixelRatio;
  waveCanvas.height = waveCanvas.clientHeight * devicePixelRatio;
}
window.addEventListener("resize", resizeWaveCanvas);
resizeWaveCanvas();

function getAccentRGB() {
  return getComputedStyle(document.documentElement).getPropertyValue("--glow").trim() || "255,176,0";
}

function animateWave() {
  requestAnimationFrame(animateWave);
  const w = waveCanvas.width, h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);
  const n = waveBars.length;
  const barW = w / n;
  const target = state.generating || state.recording ? state.waveLevel : 0;
  state.waveLevel *= 0.93;

  for (let i = 0; i < n; i++) {
    const decay = waveBars[i] * 0.85;
    const noise = (state.generating || state.recording) ? Math.random() * target : 0;
    waveBars[i] = Math.max(decay, noise * (0.4 + Math.random() * 0.6));
    const barH = Math.max(2, waveBars[i] * h * 0.9);
    const x = i * barW;
    const y = (h - barH) / 2;
    waveCtx.fillStyle = `rgba(${getAccentRGB()}, ${0.25 + waveBars[i] * 0.75})`;
    waveCtx.fillRect(x + barW * 0.2, y, barW * 0.6, barH);
  }
}
animateWave();

// ---------------------------------------------------- ambient particles
const bgCanvas = el("bg-canvas");
const bgCtx = bgCanvas.getContext("2d");
let particles = [];

function resizeBgCanvas() {
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeBgCanvas);
resizeBgCanvas();

function initParticles() {
  particles = Array.from({ length: 60 }, () => ({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    r: Math.random() * 1.6 + 0.3,
    vx: (Math.random() - 0.5) * 0.15,
    vy: (Math.random() - 0.5) * 0.15,
    a: Math.random() * 0.5 + 0.1,
  }));
}
initParticles();

function animateBg() {
  requestAnimationFrame(animateBg);
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  const rgb = getAccentRGB();
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = bgCanvas.width;
    if (p.x > bgCanvas.width) p.x = 0;
    if (p.y < 0) p.y = bgCanvas.height;
    if (p.y > bgCanvas.height) p.y = 0;
    bgCtx.beginPath();
    bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(${rgb}, ${p.a * 0.5})`;
    bgCtx.fill();
  }
}
animateBg();

// ---------------------------------------------------- initial status
(async function initStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.loaded) {
      state.modelLoaded = true;
      setStatus(true, false, "Ready — " + data.meta.name);
      toggleInput(true);
    }
  } catch (_) {}
})();
