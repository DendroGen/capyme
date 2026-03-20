window.App = (() => {
    let currentAgent = "";
    let voiceEnabled = false;
    let isConnecting = false;
    let mediaRecorder = null;
    let chunks = [];
    let micStream = null;
    let isRecording = false;
    let currentAudio = null;
    let isTyping = false;
    let profilePanelOpen = false;

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
    const avatarRing = document.getElementById("avatar-ring");
    const waveHolder = document.getElementById("wave-holder");
    const voiceDot = document.getElementById("voice-dot");
    const micDot = document.getElementById("mic-dot");
    const voiceStatusText = document.getElementById("voice-status-text");
    const micStatusText = document.getElementById("mic-status-text");
    const profileSidePanel = document.getElementById("profile-side-panel");
    const profileSideImage = document.getElementById("profile-side-image");
    const chatBackBtn = document.getElementById("chat-back-btn");

    let audioCtx = null;
    let analyser = null;
    let dataArray = null;

    function updateClock() {
        const now = new Date();
        const el = document.getElementById("nixie-clock");
        if (!el) return;
        el.textContent =
            now.toLocaleTimeString("tr-TR") + " - " +
            now.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function setVoiceStatus(enabled) {
        voiceEnabled = enabled;
        if (voiceBtn) {
            voiceBtn.textContent = enabled ? "VOICE ENGINE: ON" : "VOICE ENGINE: OFF";
            voiceBtn.classList.toggle("on", enabled);
        }
        if (voiceDot) voiceDot.classList.toggle("on", enabled);
        if (voiceStatusText) voiceStatusText.textContent = enabled ? "Voice online" : "Voice offline";
    }

    function setMicStatus(recording) {
        isRecording = recording;
        if (micBtn) micBtn.classList.toggle("recording", recording);
        if (micDot) micDot.classList.toggle("rec", recording);
        if (micStatusText) micStatusText.textContent = recording ? "Mic recording" : "Mic idle";

        if (avatarRing) avatarRing.classList.remove("idle", "talking", "recording");

        if (recording) {
            if (avatarRing) avatarRing.classList.add("recording");
            if (waveHolder) waveHolder.classList.add("active");
        } else if (!isTyping && !currentAudio) {
            if (avatarRing) avatarRing.classList.add("idle");
            if (waveHolder) waveHolder.classList.remove("active");
        }
    }

    function setTypingState(state) {
        isTyping = state;
        if (avatarRing) avatarRing.classList.remove("idle", "talking", "recording");

        if (isRecording) {
            if (avatarRing) avatarRing.classList.add("recording");
            if (waveHolder) waveHolder.classList.add("active");
        } else if (state || currentAudio) {
            if (avatarRing) avatarRing.classList.add("talking");
            if (waveHolder) waveHolder.classList.add("active");
        } else {
            if (avatarRing) avatarRing.classList.add("idle");
            if (waveHolder) waveHolder.classList.remove("active");
        }
    }

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
                if (activeProfile) activeProfile.src = src;
                if (profileSideImage) profileSideImage.src = src;
                return;
            } catch (_) {}
        }

        if (activeProfile) activeProfile.removeAttribute("src");
        if (profileSideImage) profileSideImage.removeAttribute("src");
    }

    function scrollToBottom(smooth = false) {
        if (!box) return;
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

    function appendMsg(msg, isHistory = false, audioUrl = null, emotion = null, sceneVisual = null) {
        if (!box) return;

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
            typeWriter(content, msg.content, audioUrl, sceneVisual);
        } else {
            content.textContent = msg.content || "";
            if (msg.role === "assistant" && sceneVisual) {
                window.Visuals.applySceneVisual(sceneVisual);
            }
            scrollToBottom();
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

    function typeWriter(element, text, audioUrl, sceneVisual, i = 0) {
        if (i === 0) {
            setTypingState(true);
            if (sceneVisual) {
                window.Visuals.applySceneVisual(sceneVisual);
            }
            if (audioUrl) {
                setTimeout(() => playReplyAudio(audioUrl), 30);
            }
        }

        if (i < text.length) {
            element.textContent += text.charAt(i);
            scrollToBottom();
            setTimeout(() => typeWriter(element, text, audioUrl, sceneVisual, i + 1), 17);
        } else {
            if (!currentAudio) {
                setTypingState(false);
            }
        }
    }

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

        if (sendBtn) sendBtn.disabled = true;
        if (micBtn) micBtn.disabled = true;

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
            }, false, d.audio_url || null, d.emotion || null, d.scene_visual || null);

        } catch (e) {
            appendMsg({
                role: "assistant",
                content: "*Connection error, Lab Mem.*",
                timestamp: createTimestamp()
            }, true);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            if (micBtn) micBtn.disabled = false;
            if (inp) inp.focus();
        }
    }

    async function loadHistory() {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${encodeURIComponent(currentAgent)}`);
            const d = await res.json();

            if (box) box.innerHTML = "";
            window.Visuals.clearSceneVisual();

            (d.history || []).forEach(m => {
                appendMsg(m, true);
            });

            scrollToBottom();
        } catch (_) {
            if (box) box.innerHTML = "";
        }
    }

    async function toggleVoice() {
        if (isConnecting) return;

        if (!voiceEnabled) {
            try {
                isConnecting = true;
                if (blocker) blocker.style.display = "block";
                if (voiceBtn) voiceBtn.textContent = "BOOTING...";
                if (inp) inp.disabled = true;
                if (micBtn) micBtn.disabled = true;
                if (sendBtn) sendBtn.disabled = true;

                const res = await fetch("http://127.0.0.1:5000/api/gvc/start", { method: "POST" });
                if (res.ok) setVoiceStatus(true);
            } catch (_) {
                setVoiceStatus(false);
            } finally {
                isConnecting = false;
                if (blocker) blocker.style.display = "none";
                if (inp) inp.disabled = false;
                if (micBtn) micBtn.disabled = false;
                if (sendBtn) sendBtn.disabled = false;
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

    async function clearHistory() {
        if (!currentAgent) return;
        const ok = confirm(`Delete ${currentAgent} chat history JSON?`);
        if (!ok) return;

        try {
            await fetch(`http://127.0.0.1:5000/api/clear_history?agent=${encodeURIComponent(currentAgent)}`, {
                method: "POST"
            });
            if (box) box.innerHTML = "";
            window.Visuals.clearSceneVisual();
        } catch (_) {
            alert("Could not clear history.");
        }
    }

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
        if (!canvas) return;
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
            requestAnimationFrame(draw);

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

                if (sendBtn) sendBtn.disabled = true;
                if (micBtn) micBtn.disabled = true;

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
                        }, false, d.audio_url || null, d.emotion || null, d.scene_visual || null);
                    }
                } catch (_) {
                    appendMsg({
                        role: "assistant",
                        content: "*Voice connection error.*",
                        timestamp: createTimestamp()
                    }, true);
                } finally {
                    if (sendBtn) sendBtn.disabled = false;
                    if (micBtn) micBtn.disabled = false;
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
        if (!isRecording) await startRecording();
        else stopRecording();
    }

    function updateProfilePanelPosition() {
        if (!profileSidePanel || profileSidePanel.classList.contains("hidden") || !draggable) return;

        const chatRect = draggable.getBoundingClientRect();
        const panelWidth = profileSidePanel.offsetWidth || chatRect.width;
        const gap = 12;

        let panelLeft = chatRect.left - panelWidth - gap;

        if (panelLeft < 8) {
            panelLeft = chatRect.right + gap;

            if (panelLeft + panelWidth > window.innerWidth - 8) {
                panelLeft = Math.max(8, window.innerWidth - panelWidth - 8);
            }
        }

        let panelTop = chatRect.top;
        if (panelTop + profileSidePanel.offsetHeight > window.innerHeight - 8) {
            panelTop = Math.max(8, window.innerHeight - profileSidePanel.offsetHeight - 8);
        }

        profileSidePanel.style.left = `${panelLeft}px`;
        profileSidePanel.style.top = `${panelTop}px`;
    }

    function openProfilePanel() {
        if (!profileSidePanel) return;
        profilePanelOpen = true;
        profileSidePanel.classList.remove("hidden");
        updateProfilePanelPosition();
    }

    function closeProfilePanel() {
        if (!profileSidePanel) return;
        profilePanelOpen = false;
        profileSidePanel.classList.add("hidden");
    }

    function toggleProfilePanel() {
        if (profilePanelOpen) closeProfilePanel();
        else openProfilePanel();
    }

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function clampChatPosition(left, top) {
        if (!draggable) return { left, top };

        const rect = draggable.getBoundingClientRect();
        const w = rect.width;
        const headerVisible = 56;
        const margin = 8;

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
        if (!draggable) return;
        const clamped = clampChatPosition(left, top);
        draggable.style.left = `${clamped.left}px`;
        draggable.style.top = `${clamped.top}px`;
        draggable.style.transform = "none";
    }

    function centerChat() {
        if (!draggable) return;
        const width = draggable.offsetWidth || 460;
        const height = draggable.offsetHeight || 690;
        const left = Math.max(8, (window.innerWidth - width) / 2);
        const top = Math.max(8, (window.innerHeight - height) / 2);
        applyChatPosition(left, top);
    }

    async function initAgent(agent) {
        currentAgent = agent;
        const baseUrl = `http://127.0.0.1:5000/uigrounds/${agent}`;

        await Promise.allSettled([
            setBodyBackground(baseUrl),
            setAvatar(baseUrl)
        ]);

        try {
            const headers = {};
            if (window.Agents && window.Agents.getPassword()) {
                headers["X-Agents-Password"] = window.Agents.getPassword();
            }

            const res = await fetch(`http://127.0.0.1:5000/api/agents/${agent}`, { headers });
            const data = await res.json();

            if (data.theme) {
                window.ThemeManager.applyTheme(data.theme);
            }
        } catch (e) {
            console.log("Theme load error:", e);
        }

        if (agentDisplayName) agentDisplayName.textContent = agent.replaceAll("_", " ");
        window.UIState.showChat();
        closeProfilePanel();
        centerChat();
        await loadHistory();
    }

    function bindEvents() {
        setInterval(updateClock, 1000);
        updateClock();

        if (voiceBtn) voiceBtn.addEventListener("click", toggleVoice);
        if (killBtn) killBtn.addEventListener("click", killGVC);
        if (clearBtn) clearBtn.addEventListener("click", clearHistory);
        if (micBtn) micBtn.addEventListener("click", toggleRecording);
        if (sendBtn) sendBtn.addEventListener("click", () => talk());

        if (inp) {
            inp.addEventListener("keydown", (e) => {
                if (e.key === "Enter") talk();
            });
        }

        if (activeProfile) {
            activeProfile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleProfilePanel();
            });
        }

        if (chatBackBtn) {
            chatBackBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeProfilePanel();
                window.UIState.showMainMenu();
            });
        }

        if (dragHandle) {
            dragHandle.addEventListener("mousedown", (e) => {
                if (
                    e.target === activeProfile ||
                    e.target.id === "chat-back-btn" ||
                    e.target.closest("#chat-back-btn")
                ) {
                    return;
                }

                dragging = true;
                const rect = draggable.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                startX = e.clientX;
                startY = e.clientY;

                draggable.style.transform = "none";
                document.body.style.userSelect = "none";
            });
        }

        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;

            const newLeft = initialLeft + (e.clientX - startX);
            const newTop = initialTop + (e.clientY - startY);

            applyChatPosition(newLeft, newTop);

            if (profilePanelOpen) {
                updateProfilePanelPosition();
            }
        });

        window.addEventListener("mouseup", () => {
            dragging = false;
            document.body.style.userSelect = "";
        });

        window.addEventListener("resize", () => {
            if (!draggable) return;

            const rect = draggable.getBoundingClientRect();
            if (draggable.style.display !== "none") {
                applyChatPosition(rect.left, rect.top);
            }

            if (profilePanelOpen) {
                updateProfilePanelPosition();
            }
        });

        setVoiceStatus(false);
        setMicStatus(false);
        setTypingState(false);
    }

    bindEvents();

    return {
        initAgent,
        talk,
        loadHistory,
        closeProfilePanel,
    };
})();