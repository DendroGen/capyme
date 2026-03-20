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
    let currentSceneVisualTimer = null;

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
    const profileSidePanel = document.getElementById("profile-side-panel");
    const profileSideImage = document.getElementById("profile-side-image");
    const chatBackBtn = document.getElementById("chat-back-btn");

    let audioCtx = null;
    let analyser = null;
    let dataArray = null;

    function updateClock() {
        const now = new Date();
        document.getElementById("nixie-clock").textContent =
            now.toLocaleTimeString("tr-TR") + " - " +
            now.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    setInterval(updateClock, 1000);
    updateClock();

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
            `${baseUrl}/background.jpeg`,
            `${baseUrl}/background.webp`,
            `${baseUrl}/bg.jpg`,
            `${baseUrl}/bg.png`,
            `${baseUrl}/bg.jpeg`,
            `${baseUrl}/bg.webp`
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
            `${baseUrl}/profile.jpeg`,
            `${baseUrl}/profile.webp`,
            `${baseUrl}/avatar.jpg`,
            `${baseUrl}/avatar.png`,
            `${baseUrl}/avatar.jpeg`,
            `${baseUrl}/avatar.webp`
        ];

        for (const src of candidates) {
            try {
                await preloadImage(src);
                activeProfile.src = src;
                if (profileSideImage) {
                    profileSideImage.src = src;
                }
                return;
            } catch (_) {}
        }

        activeProfile.removeAttribute("src");
        if (profileSideImage) {
            profileSideImage.removeAttribute("src");
        }
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
            `${base}/emotions/${emotion}.jpeg`,
            `${base}/emotions/${emotion}.webp`,
            `${base}/${emotion}.png`,
            `${base}/${emotion}.jpg`,
            `${base}/${emotion}.jpeg`,
            `${base}/${emotion}.webp`
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

    function showSceneVisual(sceneVisual) {
        if (!sceneVisual || !sceneVisual.image_url) return;
        if (!profileSidePanel || !profileSideImage) return;

        if (currentSceneVisualTimer) {
            clearTimeout(currentSceneVisualTimer);
            currentSceneVisualTimer = null;
        }

        profileSideImage.src = sceneVisual.image_url;
        profileSidePanel.classList.remove("hidden");
        profileSidePanel.classList.add("scene-visual-visible");
        profilePanelOpen = true;
        updateProfilePanelPosition();

        currentSceneVisualTimer = setTimeout(() => {
            profileSidePanel.classList.add("scene-visual-fade");
            setTimeout(() => {
                profileSidePanel.classList.remove("scene-visual-visible");
                profileSidePanel.classList.remove("scene-visual-fade");
                profilePanelOpen = false;
                profileSidePanel.classList.add("hidden");
                currentSceneVisualTimer = null;
            }, 15000);
        }, 100);
    }

    async function ensureMic() {
        if (micStream) return true;
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setupWaveform(micStream);
            return true;
        } catch (_) {
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
            requestAnimationFrame(draw);

            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            ctx.clearRect(0, 0, width, height);

            if (!analyser || (!isRecording && !isTyping && !currentAudio)) {
                const centerY = height / 2;
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255,255,255,0.12)";
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

                const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim() || "#ff1b1b";
                ctx.fillStyle = accent2;
                ctx.fillRect(x, y, barWidth, barHeight);
            }
        }

        draw();
    }

    function scrollToBottom(smooth = false) {
        box.scrollTo({
            top: box.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });
    }

    function createTimestamp(ts) {
        return ts || new Date().toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }

    function appendMsg(msg, isHistory = false, audioUrl = null, emotion = null, historyIndex = -1) {
        const wrap = document.createElement("div");
        wrap.className = `msg-box ${msg.role === "user" ? "user-box" : "ai-box"}`;

        const content = document.createElement("div");
        content.className = `msg ${msg.role === "user" ? "user-msg" : "ai-msg"}`;

        const ts = document.createElement("div");
        ts.className = "ts";
        ts.textContent = createTimestamp(msg.timestamp);

        wrap.appendChild(content);
        wrap.appendChild(ts);

        if (msg.role === "user" && historyIndex >= 0) {
            const editBtn = document.createElement("button");
            editBtn.className = "msg-edit-btn";
            editBtn.type = "button";
            editBtn.textContent = "Edit";

            editBtn.addEventListener("click", async () => {
                const newContent = prompt("Mesajı düzenle:", msg.content || "");
                if (!newContent || !newContent.trim()) return;

                sendBtn.disabled = true;
                micBtn.disabled = true;
                inp.disabled = true;

                try {
                    const res = await fetch("http://127.0.0.1:5000/api/history/edit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            agent: currentAgent,
                            target_index: historyIndex,
                            new_content: newContent.trim()
                        })
                    });

                    const data = await res.json();

                    if (!res.ok) {
                        alert(data.error || "Edit failed.");
                        return;
                    }

                    await loadHistory();

                    if (data.scene_visual) {
                        showSceneVisual(data.scene_visual);
                    }
                } catch (_) {
                    alert("Edit failed.");
                } finally {
                    sendBtn.disabled = false;
                    micBtn.disabled = false;
                    inp.disabled = false;
                    inp.focus();
                }
            });

            wrap.appendChild(editBtn);
        }

        box.appendChild(wrap);

        if (msg.role === "assistant" && !isHistory) {
            typeWriter(content, msg.content, audioUrl, emotion);
        } else {
            content.textContent = msg.content || "";

            if (msg.role === "assistant" && emotion) {
                setEmotionBackground(currentAgent, emotion);
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
            setTimeout(() => typeWriter(element, text, audioUrl, emotion, i + 1), 16);
        } else {
            if (!currentAudio) {
                setTypingState(false);
            }
        }
    }

    async function loadHistory() {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${encodeURIComponent(currentAgent)}`);
            const d = await res.json();
            box.innerHTML = "";

            (d.history || []).forEach((m, idx) => {
                appendMsg(m, true, null, null, idx);
            });

            scrollToBottom();
        } catch (_) {
            box.innerHTML = "";
        }
    }

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

            if (window.Theme && data.theme) {
                window.Theme.applyTheme(data.theme);
            } else if (window.Theme) {
                window.Theme.resetTheme();
            }

            agentDisplayName.textContent = data.display_name || agent.replaceAll("_", " ");
        } catch (_) {
            agentDisplayName.textContent = agent.replaceAll("_", " ");
        }

        const selectorScreenEl = document.getElementById("selector-screen");
        const agentsScreenEl = document.getElementById("agents-screen");
        const createAgentModalEl = document.getElementById("create-agent-modal");
        const agentsPasswordModalEl = document.getElementById("agents-password-modal");

        if (selectorScreenEl) selectorScreenEl.classList.add("hidden");
        if (agentsScreenEl) agentsScreenEl.classList.add("hidden");
        if (createAgentModalEl) createAgentModalEl.classList.add("hidden");
        if (agentsPasswordModalEl) agentsPasswordModalEl.classList.add("hidden");

        draggable.style.display = "flex";

        centerChat();
        await loadHistory();
    }

    async function talk(txt = null) {
        const value = txt ?? inp.value.trim();
        if (!value || !currentAgent) return;
        if (!txt) inp.value = "";

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

            if (!res.ok) {
                appendMsg({
                    role: "assistant",
                    content: d.reply || "*System error, Lab Mem.*",
                    timestamp: createTimestamp()
                }, true);
                return;
            }

            await loadHistory();

            if (d.scene_visual) {
                showSceneVisual(d.scene_visual);
            }
        } catch (_) {
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

                    if (!res.ok) {
                        appendMsg({
                            role: "assistant",
                            content: d.reply || "*Voice connection error.*",
                            timestamp: createTimestamp()
                        }, true);
                        return;
                    }

                    await loadHistory();

                    if (d.scene_visual) {
                        showSceneVisual(d.scene_visual);
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

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function clampChatPosition(left, top) {
        const rect = draggable.getBoundingClientRect();
        const w = rect.width;
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
        updateProfilePanelPosition();
    }

    function centerChat() {
        const width = draggable.offsetWidth || 460;
        const height = draggable.offsetHeight || 690;
        const left = Math.max(8, (window.innerWidth - width) / 2);
        const top = Math.max(8, (window.innerHeight - height) / 2);
        applyChatPosition(left, top);
    }

    function updateProfilePanelPosition() {
        if (!profileSidePanel || profileSidePanel.classList.contains("hidden")) return;

        const chatRect = draggable.getBoundingClientRect();
        const panelWidth = profileSidePanel.offsetWidth || 460;
        const gap = 12;

        let panelLeft = chatRect.left - panelWidth - gap;

        if (panelLeft < 8) {
            panelLeft = chatRect.right + gap;
        }

        if (panelLeft + panelWidth > window.innerWidth - 8) {
            panelLeft = Math.max(8, window.innerWidth - panelWidth - 8);
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
        if (profilePanelOpen) {
            closeProfilePanel();
        } else {
            openProfilePanel();
        }
    }

    function goBackToMenu() {
        closeProfilePanel();
        draggable.style.display = "none";
        box.innerHTML = "";
        currentAgent = "";
        document.body.style.backgroundImage = "none";

        if (window.Theme) {
            window.Theme.resetTheme();
        }

        const selectorScreenEl = document.getElementById("selector-screen");
        const agentsScreenEl = document.getElementById("agents-screen");
        const createAgentModalEl = document.getElementById("create-agent-modal");
        const agentsPasswordModalEl = document.getElementById("agents-password-modal");

        if (selectorScreenEl) selectorScreenEl.classList.remove("hidden");
        if (agentsScreenEl) agentsScreenEl.classList.add("hidden");
        if (createAgentModalEl) createAgentModalEl.classList.add("hidden");
        if (agentsPasswordModalEl) agentsPasswordModalEl.classList.add("hidden");
    }

    dragHandle.addEventListener("mousedown", (e) => {
        if (e.target === activeProfile || e.target === chatBackBtn) return;
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
        toggleProfilePanel();
    });

    if (chatBackBtn) {
        chatBackBtn.addEventListener("click", goBackToMenu);
    }

    setVoiceStatus(false);
    setMicStatus(false);
    setTypingState(false);

    return {
        initAgent,
        goBackToMenu,
        getCurrentAgent: () => currentAgent,
        showSceneVisual,
    };
})();