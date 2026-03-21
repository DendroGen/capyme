window.Chat = (() => {
    let currentAgent = "";
    let currentAgentData = null;

    let voiceEnabled = false;
    let isConnecting = false;
    let mediaRecorder = null;
    let chunks = [];
    let micStream = null;
    let isRecording = false;
    let currentAudio = null;
    let isTyping = false;

    const box = document.getElementById("box");
    const inp = document.getElementById("inp");
    const voiceBtn = document.getElementById("voice-btn");
    const emotionToggleBtn = document.getElementById("emotion-toggle-btn");
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
    const chatBackBtn = document.getElementById("chat-back-btn");

    let audioCtx = null;
    let analyser = null;
    let dataArray = null;

    function setVoiceStatus(enabled) {
        voiceEnabled = enabled;
        if (voiceBtn) {
            voiceBtn.textContent = enabled ? "VOICE ENGINE: ON" : "VOICE ENGINE: OFF";
            voiceBtn.classList.toggle("on", enabled);
        }
        voiceDot?.classList.toggle("on", enabled);
        if (voiceStatusText) {
            voiceStatusText.textContent = enabled ? "Voice online" : "Voice offline";
        }
    }

    function setMicStatus(recording) {
        isRecording = recording;
        micBtn?.classList.toggle("recording", recording);
        micDot?.classList.toggle("rec", recording);
        if (micStatusText) {
            micStatusText.textContent = recording ? "Mic recording" : "Mic idle";
        }

        avatarRing?.classList.remove("idle", "talking", "recording");
        if (recording) {
            avatarRing?.classList.add("recording");
            waveHolder?.classList.add("active");
        } else if (!isTyping && !currentAudio) {
            avatarRing?.classList.add("idle");
            waveHolder?.classList.remove("active");
        }
    }

    function setTypingState(state) {
        isTyping = state;

        avatarRing?.classList.remove("idle", "talking", "recording");

        if (isRecording) {
            avatarRing?.classList.add("recording");
            waveHolder?.classList.add("active");
        } else if (state || currentAudio) {
            avatarRing?.classList.add("talking");
            waveHolder?.classList.add("active");
        } else {
            avatarRing?.classList.add("idle");
            if (!isRecording) {
                waveHolder?.classList.remove("active");
            }
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
            `${baseUrl}/background.gif`,
            `${baseUrl}/background.webp`,
            `${baseUrl}/background.jpg`,
            `${baseUrl}/background.png`,
            `${baseUrl}/bg.gif`,
            `${baseUrl}/bg.webp`,
            `${baseUrl}/bg.jpg`,
            `${baseUrl}/bg.png`
        ];

        for (const src of candidates) {
            try {
                await preloadImage(src);
                document.body.style.backgroundImage = `url('${src}')`;
                return src;
            } catch (_) {}
        }

        document.body.style.backgroundImage = "none";
        return "";
    }

    async function setAvatar(baseUrl) {
        const candidates = [
            `${baseUrl}/profile.gif`,
            `${baseUrl}/profile.webp`,
            `${baseUrl}/profile.jpg`,
            `${baseUrl}/profile.png`,
            `${baseUrl}/avatar.gif`,
            `${baseUrl}/avatar.webp`,
            `${baseUrl}/avatar.jpg`,
            `${baseUrl}/avatar.png`
        ];

        for (const src of candidates) {
            try {
                await preloadImage(src);
                activeProfile.src = src;
                window.Visuals.setFallbackProfile(src);
                return src;
            } catch (_) {}
        }

        activeProfile.removeAttribute("src");
        window.Visuals.setFallbackProfile("");
        return "";
    }

    async function setEmotionBackground(agent, emotion) {
        if (!chatEmotionBg || !agent || !emotion) {
            chatEmotionBg?.classList.remove("show");
            return;
        }

        const base = `http://127.0.0.1:5000/uigrounds/${agent}`;
        const candidates = [
            `${base}/emotions/${emotion}.gif`,
            `${base}/emotions/${emotion}.webp`,
            `${base}/emotions/${emotion}.png`,
            `${base}/emotions/${emotion}.jpg`
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

    async function setupAgentTheme(agent) {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/agents/${encodeURIComponent(agent)}`);
            const data = await res.json();
            currentAgentData = data;

            if (data.theme) {
                window.Theme.applyTheme({
                    accent: data.theme.accent,
                    accent2: data.theme.accent2,
                    text: data.theme.text,
                    panel: data.theme.panel_hex || data.theme.panel || "#0c0606"
                });
            }

            return data;
        } catch (e) {
            console.error("Theme load error:", e);
            currentAgentData = null;
            return null;
        }
    }

    async function initAgent(agent) {
        currentAgent = agent;

        const baseUrl = `http://127.0.0.1:5000/uigrounds/${agent}`;

        await Promise.allSettled([
            setBodyBackground(baseUrl),
            setAvatar(baseUrl),
            setupAgentTheme(agent)
        ]);

        if (agentDisplayName) {
            agentDisplayName.textContent =
                currentAgentData?.display_name || agent.replaceAll("_", " ");
        }

        window.UIState.showChat();
        centerChat();
        await loadHistory();
        setTypingState(false);
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

    function renderMessageActions(wrap, msg, visibleIndex) {
        if (msg.role !== "user") return;

        const actions = document.createElement("div");
        actions.className = "message-actions";

        const editBtn = document.createElement("button");
        editBtn.className = "msg-edit-btn";
        editBtn.type = "button";
        editBtn.textContent = "Edit";

        editBtn.addEventListener("click", async () => {
            const newText = prompt("Mesajı düzenle:", msg.content || "");
            if (newText === null) return;
            if (!newText.trim()) return;

            await editMessage(visibleIndex, newText.trim());
        });

        actions.appendChild(editBtn);
        wrap.appendChild(actions);
    }

    function appendMsg(msg, isHistory = false, audioUrl = null, emotion = null, scene = null, visibleIndex = null) {
        const wrap = document.createElement("div");
        wrap.className = `msg-box ${msg.role === "user" ? "user-box" : "ai-box"}`;

        const content = document.createElement("div");
        content.className = `msg ${msg.role === "user" ? "user-msg" : "ai-msg"}`;

        const ts = document.createElement("div");
        ts.className = "ts";
        ts.textContent = createTimestamp(msg.timestamp);

        wrap.appendChild(content);
        wrap.appendChild(ts);

        if (typeof visibleIndex === "number") {
            renderMessageActions(wrap, msg, visibleIndex);
        }

        box?.appendChild(wrap);

        if (msg.role === "assistant" && !isHistory) {
            typeWriter(content, msg.content || "", audioUrl, emotion, scene);
        } else {
            content.textContent = msg.content || "";
            scrollToBottom();

            if (msg.role === "assistant") {
                if (emotion && window.Visuals.isEmotionEnabled()) {
                    setEmotionBackground(currentAgent, emotion);
                }
                window.Visuals.updateFromScene(scene || null);
            }
        }
    }

    function playReplyAudio(audioUrl) {
        if (!audioUrl || !voiceEnabled) return;

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        currentAudio = new Audio(audioUrl);
        currentAudio.play().catch(() => {});
        setTypingState(true);

        currentAudio.onended = () => {
            currentAudio = null;
            setTypingState(false);
        };

        currentAudio.onerror = () => {
            currentAudio = null;
            setTypingState(false);
        };
    }

    function typeWriter(element, text, audioUrl, emotion, scene, i = 0) {
        if (i === 0) {
            setTypingState(true);

            if (emotion && window.Visuals.isEmotionEnabled()) {
                setEmotionBackground(currentAgent, emotion);
            }

            window.Visuals.updateFromScene(scene || null);

            if (audioUrl) {
                setTimeout(() => playReplyAudio(audioUrl), 20);
            }
        }

        if (i < text.length) {
            element.textContent += text.charAt(i);
            scrollToBottom();
            setTimeout(() => typeWriter(element, text, audioUrl, emotion, scene, i + 1), 12);
        } else if (!currentAudio) {
            setTypingState(false);
        }
    }

    async function talk(txt = null) {
        const value = txt ?? inp?.value.trim();
        if (!value || !currentAgent) return;

        if (!txt && inp) {
            inp.value = "";
        }

        appendMsg({
            role: "user",
            content: value,
            timestamp: createTimestamp()
        }, true, null, null, null, window.__lastVisibleUserIndex ?? 0);

        if (sendBtn) sendBtn.disabled = true;
        if (micBtn) micBtn.disabled = true;
        setTypingState(true);

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

            const data = await res.json();

            appendMsg({
                role: "assistant",
                content: data.reply || "*System error, Lab Mem.*",
                timestamp: createTimestamp()
            }, false, data.audio_url || null, data.emotion || null, data.scene || null, null);

            await loadHistory(false);
        } catch (e) {
            console.error(e);
            appendMsg({
                role: "assistant",
                content: "*Connection error, Lab Mem.*",
                timestamp: createTimestamp()
            }, true);
            setTypingState(false);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            if (micBtn) micBtn.disabled = false;
            inp?.focus();
        }
    }

    async function loadHistory(clearFirst = true) {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${encodeURIComponent(currentAgent)}`);
            const data = await res.json();

            if (clearFirst && box) {
                box.innerHTML = "";
            }

            let visibleUserIndex = 0;

            (data.history || []).forEach((m) => {
                const idx = m.role === "user" ? visibleUserIndex++ : null;
                appendMsg(m, true, null, null, null, idx);
            });

            window.__lastVisibleUserIndex = visibleUserIndex;
            scrollToBottom();
        } catch (e) {
            console.error("History load error:", e);
            if (box && clearFirst) {
                box.innerHTML = "";
            }
        }
    }

    async function editMessage(visibleIndex, newContent) {
        if (!currentAgent) return;

        try {
            const res = await fetch("http://127.0.0.1:5000/api/history/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agent: currentAgent,
                    visible_index: visibleIndex,
                    new_content: newContent
                })
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Mesaj düzenlenemedi.");
                return;
            }

            if (box) {
                box.innerHTML = "";
            }

            let visibleUserIndex = 0;
            (data.history || []).forEach((m) => {
                const idx = m.role === "user" ? visibleUserIndex++ : null;
                appendMsg(m, true, null, null, null, idx);
            });

            window.__lastVisibleUserIndex = visibleUserIndex;
            scrollToBottom();

            if (data.reply) {
                appendMsg({
                    role: "assistant",
                    content: data.reply,
                    timestamp: createTimestamp()
                }, false, data.audio_url || null, data.emotion || null, data.scene || null, null);
            }
        } catch (e) {
            console.error("Edit message error:", e);
            alert("Mesaj düzenlenemedi.");
        }
    }

    async function clearHistory() {
        if (!currentAgent) return;

        const ok = confirm(`${currentAgent} geçmişini silmek istiyor musun?`);
        if (!ok) return;

        try {
            await fetch(`http://127.0.0.1:5000/api/clear_history?agent=${encodeURIComponent(currentAgent)}`, {
                method: "POST"
            });

            if (box) box.innerHTML = "";
            chatEmotionBg?.classList.remove("show");
            window.Visuals.showFallbackProfile();
        } catch {
            alert("Could not clear history.");
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
                if (res.ok) {
                    setVoiceStatus(true);
                }
            } catch {
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
        } catch {}
        setVoiceStatus(false);
        alert("Engine Killed.");
    }

    async function ensureMic() {
        if (micStream) return true;

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setupWaveform(micStream);
            return true;
        } catch {
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
                if (e.data && e.data.size > 0) {
                    chunks.push(e.data);
                }
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

                    const data = await res.json();

                    if (data.user_text) {
                        appendMsg({
                            role: "user",
                            content: data.user_text,
                            timestamp: createTimestamp()
                        }, true, null, null, null, window.__lastVisibleUserIndex ?? 0);
                    }

                    if (data.reply) {
                        appendMsg({
                            role: "assistant",
                            content: data.reply,
                            timestamp: createTimestamp()
                        }, false, data.audio_url || null, data.emotion || null, data.scene || null, null);
                    }

                    await loadHistory(false);
                } catch {
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
        } catch {
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
        const margin = 10;
        const headerVisible = 60;

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
        const width = draggable.offsetWidth || 540;
        const height = draggable.offsetHeight || 740;
        const left = Math.max(10, (window.innerWidth - width) / 2);
        const top = Math.max(10, (window.innerHeight - height) / 2);
        applyChatPosition(left, top);
        updateProfilePanelPosition();
    }

    function updateProfilePanelPosition() {
        const profileSidePanel = document.getElementById("profile-side-panel");
        if (!profileSidePanel || profileSidePanel.classList.contains("hidden")) return;

        const chatRect = draggable.getBoundingClientRect();
        const panelWidth = profileSidePanel.offsetWidth || 280;
        const gap = 12;

        let panelLeft = chatRect.left - panelWidth - gap;
        if (panelLeft < 8) {
            panelLeft = chatRect.right + gap;
            if (panelLeft + panelWidth > window.innerWidth - 8) {
                panelLeft = Math.max(8, window.innerWidth - panelWidth - 8);
            }
        }

        let panelTop = chatRect.top;
        const maxTop = Math.max(8, window.innerHeight - profileSidePanel.offsetHeight - 8);
        if (panelTop > maxTop) panelTop = maxTop;

        profileSidePanel.style.left = `${panelLeft}px`;
        profileSidePanel.style.top = `${panelTop}px`;
    }

    function goBackToMenu() {
        document.body.style.backgroundImage = "none";
        window.Theme.applyDefaultTheme();
        window.Visuals.closePanel();
        window.UIState.showMainMenu();
    }

    function bindEvents() {
        voiceBtn?.addEventListener("click", toggleVoice);
        killBtn?.addEventListener("click", killGVC);
        clearBtn?.addEventListener("click", clearHistory);
        micBtn?.addEventListener("click", toggleRecording);
        sendBtn?.addEventListener("click", () => talk());

        inp?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                talk();
            }
        });

        activeProfile?.addEventListener("click", (e) => {
            e.stopPropagation();
            window.Visuals.togglePanel();
            updateProfilePanelPosition();
        });

        emotionToggleBtn?.addEventListener("click", () => {
            const next = !window.Visuals.isEmotionEnabled();
            window.Visuals.setEmotionEnabled(next);
            emotionToggleBtn.textContent = next ? "EMOTION: ON" : "EMOTION: OFF";
        });

        chatBackBtn?.addEventListener("click", goBackToMenu);

        dragHandle?.addEventListener("mousedown", (e) => {
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
            updateProfilePanelPosition();
        });

        window.addEventListener("mouseup", () => {
            dragging = false;
            document.body.style.userSelect = "";
        });

        window.addEventListener("resize", () => {
            if (!draggable.classList.contains("hidden")) {
                const rect = draggable.getBoundingClientRect();
                applyChatPosition(rect.left, rect.top);
                updateProfilePanelPosition();
            }
        });
    }

    bindEvents();
    setVoiceStatus(false);
    setMicStatus(false);
    setTypingState(false);

    return {
        initAgent,
        centerChat,
        updateProfilePanelPosition,
        loadHistory,
        currentAgent: () => currentAgent
    };
})();