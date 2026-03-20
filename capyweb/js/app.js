/* # GLOBAL STATE */
let currentAgent = "";
let voiceEnabled = false;
let isConnecting = false;
let mediaRecorder = null;
let chunks = [];
let micStream = null;
let isRecording = false;
let currentAudio = null;
let isTyping = false;

/* # DOM */
const box = document.getElementById("box");
const inp = document.getElementById("inp");
const voiceBtn = document.getElementById("voice-btn");
const killBtn = document.getElementById("kill-btn");
const blocker = document.getElementById("blocker-msg");
const micBtn = document.getElementById("mic");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear-btn");
const draggable = document.getElementById("draggable");
const dragHandle = document.getElementById("drag-handle");
const activeProfile = document.getElementById("active-profile");
const agentDisplayName = document.getElementById("agent-display-name");
const chatEmotionBg = document.getElementById("chat-emotion-bg");
const avatarRing = document.getElementById("avatar-ring");
const waveHolder = document.getElementById("wave-holder");
const voiceDot = document.getElementById("voice-dot");
const micDot = document.getElementById("mic-dot");
const voiceStatusText = document.getElementById("voice-status-text");
const micStatusText = document.getElementById("mic-status-text");

/* # CLOCK */
function updateClock() {
    const now = new Date();
    document.getElementById("nixie-clock").textContent =
        now.toLocaleTimeString("tr-TR") + " - " +
        now.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
setInterval(updateClock, 1000);
updateClock();

/* # STATUS UI */
function setVoiceStatus(enabled) {
    voiceEnabled = enabled;
    voiceBtn.textContent = enabled ? "VOICE ENGINE: ON" : "VOICE ENGINE: OFF";
    voiceBtn.classList.toggle("on", enabled);
    voiceDot.classList.toggle("on", enabled);
    voiceStatusText.textContent = enabled ? "Voice online" : "Voice offline";
}

function setMicStatus(recording) {
    isRecording = recording;
    micBtn.classList.toggle("recording", recording);
    micDot.classList.toggle("rec", recording);
    micStatusText.textContent = recording ? "Mic recording" : "Mic idle";

    avatarRing.classList.remove("talking", "recording");
    if (recording) {
        avatarRing.classList.add("recording");
        waveHolder.classList.add("active");
    } else if (!isTyping && !currentAudio) {
        avatarRing.classList.add("idle");
        waveHolder.classList.remove("active");
    }
}

function setTypingState(state) {
    isTyping = state;
    avatarRing.classList.remove("idle", "talking", "recording");
    if (isRecording) {
        avatarRing.classList.add("recording");
        waveHolder.classList.add("active");
    } else if (state || currentAudio) {
        avatarRing.classList.add("talking");
        waveHolder.classList.add("active");
    } else {
        avatarRing.classList.add("idle");
        if (!isRecording) waveHolder.classList.remove("active");
    }
}

/* # IMAGE HELPERS */
function preloadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = reject;
        img.src = src;
    });
}

async function setBodyBackground(baseUrl) {
    const candidates = [
        `${baseUrl}/background.jpg`,
        `${baseUrl}/background.png`,
        `${baseUrl}/bg.jpg`,
        `${baseUrl}/bg.png`
    ];

    for (const src of candidates) {
        try {
            await preloadImage(src);
            document.body.style.backgroundImage = `url('${src}')`;
            return;
        } catch (_) {}
    }

    document.body.style.backgroundImage = "none";
}

async function setAvatar(baseUrl) {
    const candidates = [
        `${baseUrl}/profile.jpg`,
        `${baseUrl}/profile.png`,
        `${baseUrl}/avatar.jpg`,
        `${baseUrl}/avatar.png`
    ];

    for (const src of candidates) {
        try {
            await preloadImage(src);
            activeProfile.src = src;
            return;
        } catch (_) {}
    }

    activeProfile.removeAttribute("src");
}

async function setEmotionBackground(agent, emotion) {
    if (!agent || !emotion) {
        chatEmotionBg.classList.remove("show");
        return;
    }

    const base = `http://127.0.0.1:5000/uigrounds/${agent}`;
    const candidates = [
        `${base}/emotions/${emotion}.png`,
        `${base}/emotions/${emotion}.jpg`,
        `${base}/${emotion}.png`,
        `${base}/${emotion}.jpg`
    ];

    for (const src of candidates) {
        try {
            await preloadImage(src);
            chatEmotionBg.style.backgroundImage = `url('${src}')`;
            chatEmotionBg.classList.add("show");
            return;
        } catch (_) {}
    }

    chatEmotionBg.classList.remove("show");
}

/* # MIC / WAVEFORM */
let audioCtx = null;
let analyser = null;
let dataArray = null;
let waveformAnim = null;

async function ensureMic() {
    if (micStream) return true;
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupWaveform(micStream);
        return true;
    } catch (e) {
        alert("Microphone access denied or unavailable.");
        return false;
    }
}

function setupWaveform(stream) {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    const canvas = document.getElementById("wave");
    const ctx = canvas.getContext("2d");

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(10, Math.floor(rect.width * window.devicePixelRatio));
        canvas.height = Math.max(10, Math.floor(rect.height * window.devicePixelRatio));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function draw() {
        waveformAnim = requestAnimationFrame(draw);

        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);

        if (!analyser || (!isRecording && !isTyping && !currentAudio)) {
            const centerY = height / 2;
            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 0, 0, 0.18)";
            ctx.lineWidth = 1;
            ctx.moveTo(0, centerY);
            ctx.lineTo(width, centerY);
            ctx.stroke();
            return;
        }

        analyser.getByteFrequencyData(dataArray);

        const bars = dataArray.length;
        const gap = 3;
        const barWidth = Math.max(2, (width - (bars - 1) * gap) / bars);

        for (let i = 0; i < bars; i++) {
            const v = dataArray[i] / 255;
            let barHeight = Math.max(3, v * (height - 4));

            if (isTyping && !isRecording && !currentAudio) {
                barHeight = 6 + Math.abs(Math.sin(Date.now() / 90 + i)) * (height * 0.45);
            }

            if (currentAudio && !isRecording) {
                barHeight = 6 + Math.abs(Math.sin(Date.now() / 70 + i * 0.7)) * (height * 0.62);
            }

            const x = i * (barWidth + gap);
            const y = (height - barHeight) / 2;

            ctx.fillStyle = "rgba(255, 35, 35, 0.92)";
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    draw();
}

/* # AGENT INIT */
async function initAgent(agent) {
    currentAgent = agent;
    const baseUrl = `http://127.0.0.1:5000/uigrounds/${agent}`;

    await Promise.allSettled([
        setBodyBackground(baseUrl),
        setAvatar(baseUrl)
    ]);

    try {
        const res = await fetch(`http://127.0.0.1:5000/api/agents/${agent}`);
        const data = await res.json();

        if (data.theme) {
            if (data.theme.accent) {
                document.documentElement.style.setProperty("--accent", data.theme.accent);
            }
            if (data.theme.accent2) {
                document.documentElement.style.setProperty("--accent2", data.theme.accent2);
            }
            if (data.theme.panel) {
                document.documentElement.style.setProperty("--panel", data.theme.panel);
            }
            if (data.theme.text) {
                document.documentElement.style.setProperty("--text", data.theme.text);
            }
        }
    } catch (e) {
        console.log("Theme load error:", e);
    }

    agentDisplayName.textContent = agent.replaceAll("_", " ");

    const selectorScreenEl = document.getElementById("selector-screen");
    const agentsScreenEl = document.getElementById("agents-screen");
    const createAgentModalEl = document.getElementById("create-agent-modal");

    if (selectorScreenEl) selectorScreenEl.classList.add("hidden");
    if (agentsScreenEl) agentsScreenEl.classList.add("hidden");
    if (createAgentModalEl) createAgentModalEl.classList.add("hidden");

    draggable.style.display = "flex";

    centerChat();
    await loadHistory();
}

/* # MESSAGES */
function scrollToBottom(smooth = false) {
    box.scrollTo({
        top: box.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
    });
}

function createTimestamp(ts) {
    return ts || new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function appendMsg(msg, isHistory = false, audioUrl = null, emotion = null) {
    const wrap = document.createElement("div");
    wrap.className = `msg-box ${msg.role === "user" ? "user-box" : "ai-box"}`;

    const content = document.createElement("div");
    content.className = `msg ${msg.role === "user" ? "user-msg" : "ai-msg"}`;

    const ts = document.createElement("div");
    ts.className = "ts";
    ts.textContent = createTimestamp(msg.timestamp);

    wrap.appendChild(content);
    wrap.appendChild(ts);
    box.appendChild(wrap);

    if (msg.role === "assistant" && !isHistory) {
        typeWriter(content, msg.content, audioUrl, emotion);
    } else {
        content.textContent = msg.content || "";
        scrollToBottom();
        if (msg.role === "assistant" && emotion) {
            setEmotionBackground(currentAgent, emotion);
        }
    }
}

function playReplyAudio(audioUrl) {
    if (!audioUrl || !voiceEnabled) return;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    const a = new Audio(audioUrl);
    currentAudio = a;
    setTypingState(true);

    a.play().catch(() => {});
    a.onended = () => {
        currentAudio = null;
        setTypingState(false);
    };
    a.onerror = () => {
        currentAudio = null;
        setTypingState(false);
    };
}

function typeWriter(element, text, audioUrl, emotion, i = 0) {
    if (i === 0) {
        setTypingState(true);
        if (emotion) setEmotionBackground(currentAgent, emotion);
        if (audioUrl) {
            setTimeout(() => playReplyAudio(audioUrl), 30);
        }
    }

    if (i < text.length) {
        element.textContent += text.charAt(i);
        scrollToBottom();
        setTimeout(() => typeWriter(element, text, audioUrl, emotion, i + 1), 17);
    } else {
        if (!currentAudio) {
            setTypingState(false);
        }
    }
}

/* # CHAT SEND */
async function talk(txt = null) {
    const value = txt ?? inp.value.trim();
    if (!value || !currentAgent) return;
    if (!txt) inp.value = "";

    appendMsg({
        role: "user",
        content: value,
        timestamp: new Date().toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit"
        })
    }, true);

    sendBtn.disabled = true;
    micBtn.disabled = true;

    try {
        const res = await fetch("http://127.0.0.1:5000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: value,
                agent: currentAgent,
                voice_enabled: voiceEnabled
            })
        });

        const d = await res.json();

        appendMsg({
            role: "assistant",
            content: d.reply || "*System error, Lab Mem.*",
            timestamp: new Date().toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit"
            })
        }, false, d.audio_url || null, d.emotion || null);

    } catch (e) {
        appendMsg({
            role: "assistant",
            content: "*Connection error, Lab Mem.*",
            timestamp: createTimestamp()
        }, true);
    } finally {
        sendBtn.disabled = false;
        micBtn.disabled = false;
        inp.focus();
    }
}

/* # HISTORY */
async function loadHistory() {
    try {
        const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${encodeURIComponent(currentAgent)}`);
        const d = await res.json();
        box.innerHTML = "";

        let lastEmotion = null;

        (d.history || []).forEach(m => {
            appendMsg(m, true);
            if (m.role === "assistant") lastEmotion = null;
        });

        if (lastEmotion) {
            setEmotionBackground(currentAgent, lastEmotion);
        } else {
            chatEmotionBg.classList.remove("show");
        }

        scrollToBottom();
    } catch (_) {
        box.innerHTML = "";
    }
}

/* # VOICE ENGINE BUTTONS */
async function toggleVoice() {
    if (isConnecting) return;

    if (!voiceEnabled) {
        try {
            isConnecting = true;
            blocker.style.display = "block";
            voiceBtn.textContent = "BOOTING...";
            inp.disabled = true;
            micBtn.disabled = true;
            sendBtn.disabled = true;

            const res = await fetch("http://127.0.0.1:5000/api/gvc/start", { method: "POST" });
            if (res.ok) {
                setVoiceStatus(true);
            }
        } catch (_) {
            setVoiceStatus(false);
        } finally {
            isConnecting = false;
            blocker.style.display = "none";
            inp.disabled = false;
            micBtn.disabled = false;
            sendBtn.disabled = false;
        }
    } else {
        setVoiceStatus(false);
    }
}

async function killGVC() {
    try {
        await fetch("http://127.0.0.1:5000/api/gvc/kill", { method: "POST" });
    } catch (_) {}
    setVoiceStatus(false);
    alert("Engine Killed.");
}

/* # CLEAR HISTORY */
async function clearHistory() {
    if (!currentAgent) return;
    const ok = confirm(`Delete ${currentAgent} chat history JSON?`);
    if (!ok) return;

    try {
        await fetch(`http://127.0.0.1:5000/api/clear_history?agent=${encodeURIComponent(currentAgent)}`, {
            method: "POST"
        });
        box.innerHTML = "";
        chatEmotionBg.classList.remove("show");
    } catch (_) {
        alert("Could not clear history.");
    }
}

/* # MIC RECORDING */
async function startRecording() {
    if (isRecording) return;

    const ok = await ensureMic();
    if (!ok || !micStream) return;

    try {
        chunks = [];
        mediaRecorder = new MediaRecorder(micStream);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            if (!chunks.length) return;

            const fd = new FormData();
            fd.append("audio", new Blob(chunks, { type: "audio/webm" }), "voice.webm");
            fd.append("agent", currentAgent);
            fd.append("voice_enabled", String(voiceEnabled));

            sendBtn.disabled = true;
            micBtn.disabled = true;

            try {
                const res = await fetch("http://127.0.0.1:5000/api/voice_chat", {
                    method: "POST",
                    body: fd
                });
                const d = await res.json();

                if (d.user_text) {
                    appendMsg({
                        role: "user",
                        content: d.user_text,
                        timestamp: createTimestamp()
                    }, true);
                }

                if (d.reply) {
                    appendMsg({
                        role: "assistant",
                        content: d.reply,
                        timestamp: createTimestamp()
                    }, false, d.audio_url || null, d.emotion || null);
                }
            } catch (_) {
                appendMsg({
                    role: "assistant",
                    content: "*Voice connection error.*",
                    timestamp: createTimestamp()
                }, true);
            } finally {
                sendBtn.disabled = false;
                micBtn.disabled = false;
            }
        };

        mediaRecorder.start();
        setMicStatus(true);
    } catch (_) {
        setMicStatus(false);
        alert("Could not start recording.");
    }
}

function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    mediaRecorder.stop();
    setMicStatus(false);
}

async function toggleRecording() {
    if (!currentAgent) return;
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

/* # DRAG SYSTEM */
let dragging = false;
let startX = 0;
let startY = 0;
let initialLeft = 0;
let initialTop = 0;

function clampChatPosition(left, top) {
    const rect = draggable.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const margin = 8;
    const headerVisible = 56;

    const minLeft = margin;
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);

    const minTop = margin;
    const maxTop = Math.max(margin, window.innerHeight - headerVisible);

    return {
        left: Math.min(Math.max(left, minLeft), maxLeft),
        top: Math.min(Math.max(top, minTop), maxTop)
    };
}

function applyChatPosition(left, top) {
    const clamped = clampChatPosition(left, top);
    draggable.style.left = `${clamped.left}px`;
    draggable.style.top = `${clamped.top}px`;
    draggable.style.transform = "none";
}

function centerChat() {
    const width = draggable.offsetWidth || 460;
    const height = draggable.offsetHeight || 690;
    const left = Math.max(8, (window.innerWidth - width) / 2);
    const top = Math.max(8, (window.innerHeight - height) / 2);
    applyChatPosition(left, top);
}

dragHandle.addEventListener("mousedown", (e) => {
    if (e.target === activeProfile) return;
    dragging = true;

    const rect = draggable.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    draggable.style.transform = "none";
    document.body.style.userSelect = "none";
});

window.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const newLeft = initialLeft + (e.clientX - startX);
    const newTop = initialTop + (e.clientY - startY);

    applyChatPosition(newLeft, newTop);
});

window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.userSelect = "";
});

window.addEventListener("resize", () => {
    const rect = draggable.getBoundingClientRect();
    if (draggable.style.display !== "none") {
        applyChatPosition(rect.left, rect.top);
    }
});

/* # MINIMIZE */
function toggleMinimize() {
    draggable.classList.toggle("minimized");
    setTimeout(() => {
        const rect = draggable.getBoundingClientRect();
        applyChatPosition(rect.left, rect.top);
    }, 10);
}

/* # EVENTS */
voiceBtn.addEventListener("click", toggleVoice);
killBtn.addEventListener("click", killGVC);
clearBtn.addEventListener("click", clearHistory);
micBtn.addEventListener("click", toggleRecording);
sendBtn.addEventListener("click", () => talk());

inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") talk();
});

activeProfile.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMinimize();
});

/* # INITIAL UI STATE */
setVoiceStatus(false);
setMicStatus(false);
setTypingState(false);  