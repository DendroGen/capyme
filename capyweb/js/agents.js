window.Agents = (() => {
    const openAgentsBtn = document.getElementById("open-agents-btn");
    const backToMainBtn = document.getElementById("back-to-main-btn");
    const closeCreateAgentBtn = document.getElementById("close-create-agent-btn");
    const cancelCreateAgentBtn = document.getElementById("cancel-create-agent-btn");
    const agentsGrid = document.getElementById("agents-grid");
    const agentSearch = document.getElementById("agent-search");
    const createAgentForm = document.getElementById("create-agent-form");
    const agentsPasswordInput = document.getElementById("agents-password-input");
    const agentsPasswordConfirmBtn = document.getElementById("agents-password-confirm-btn");
    const agentsPasswordCancelBtn = document.getElementById("agents-password-cancel-btn");

    const formMode = document.getElementById("form-mode");
    const editingAgentName = document.getElementById("editing-agent-name");
    const createAgentModalTitle = document.getElementById("create-agent-modal-title");
    const profilePreviewWrap = document.getElementById("profile-preview-wrap");
    const backgroundPreviewWrap = document.getElementById("background-preview-wrap");

    let cachedAgents = [];
    let agentsPassword = "";
    let currentFilter = "all";

    function getPassword() {
        return agentsPassword;
    }

    function getAuthHeaders() {
        return {
            "X-Agents-Password": agentsPassword
        };
    }

    function renderMiniPreview(wrap, url) {
        if (!wrap) return;
        if (!url) {
            wrap.innerHTML = "";
            return;
        }
        wrap.innerHTML = `<div class="mini-preview"><img src="${url}" alt="preview"></div>`;
    }

    function createAgentCardHTML(agent) {
        const img = agent.profile_url || "http://127.0.0.1:5000/uigrounds/Makise_Kurisu/profile.jpg";
        const personality = (agent.personality || "No personality description.").slice(0, 110);
        const posesCount = Array.isArray(agent.poses) ? agent.poses.length : 0;
        const emotionsCount = Array.isArray(agent.emotions) ? agent.emotions.length : 0;

        const accent = agent.theme?.accent || "#a10000";
        const accent2 = agent.theme?.accent2 || "#ff1b1b";

        return `
            <div class="agent-browser-card real-agent-card" data-agent-name="${agent.name}" style="border-color:${accent}; box-shadow:0 0 18px ${accent}33;">
                <div class="agent-browser-image-wrap">
                    <img src="${img}" alt="${agent.display_name}">
                </div>

                <div class="agent-browser-content" style="border-top:1px solid ${accent}55;">
                    <div class="agent-browser-title">${agent.display_name}</div>
                    <div class="agent-browser-sub">${personality}${personality.length >= 110 ? "..." : ""}</div>
                    <div class="agent-browser-meta">Poses: ${posesCount} | Emotions: ${emotionsCount}</div>

                    <div class="agent-browser-actions">
                        <button type="button" class="agent-mini-btn open-chat-btn" data-agent-name="${agent.name}">Open</button>
                        <button type="button" class="agent-mini-btn open-settings-btn" data-agent-name="${agent.name}">Settings</button>
                        <button type="button" class="agent-mini-btn delete-agent-btn" data-agent-name="${agent.name}">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

    function matchesFilter(agent) {
        const posesCount = Array.isArray(agent.poses) ? agent.poses.length : 0;
        const emotionsCount = Array.isArray(agent.emotions) ? agent.emotions.length : 0;

        if (currentFilter === "poses") return posesCount > 0;
        if (currentFilter === "emotions") return emotionsCount > 0;
        return true;
    }

    function renderAgents(agentList) {
        if (!agentsGrid) return;

        const query = ((agentSearch && agentSearch.value) || "").trim().toLowerCase();

        const filtered = agentList.filter(agent => {
            if (!matchesFilter(agent)) return false;
            const haystack = `${agent.display_name} ${agent.name} ${agent.personality || ""}`.toLowerCase();
            return haystack.includes(query);
        });

        const createCard = `
            <div class="agent-browser-card agent-create-card" id="agent-create-card">
                <div class="agent-browser-content" style="align-items:center; justify-content:center; text-align:center;">
                    <div class="agent-create-plus">+</div>
                    <div class="agent-browser-title">Ajan Yarat</div>
                    <div class="agent-browser-sub">Yeni ajan oluştur ve listeye ekle</div>
                </div>
            </div>
        `;

        agentsGrid.innerHTML = createCard + filtered.map(createAgentCardHTML).join("");

        document.getElementById("agent-create-card")?.addEventListener("click", () => {
            resetAgentForm();
            window.UIState.showCreateAgentModal();
        });

        document.querySelectorAll(".open-chat-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const agentName = btn.dataset.agentName;
                window.App.initAgent(agentName);
            });
        });

        document.querySelectorAll(".open-settings-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const agentName = btn.dataset.agentName;
                await openEditAgent(agentName);
            });
        });

        document.querySelectorAll(".delete-agent-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const agentName = btn.dataset.agentName;
                const ok = confirm(`${agentName} tamamen silinsin mi?`);
                if (!ok) return;

                try {
                    const res = await fetch(`http://127.0.0.1:5000/api/agents/${encodeURIComponent(agentName)}`, {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        alert(data.error || "Delete failed");
                        return;
                    }

                    await fetchAgents();
                } catch (err) {
                    console.error(err);
                    alert("Delete error");
                }
            });
        });
    }

    async function fetchAgents() {
        const res = await fetch("http://127.0.0.1:5000/api/agents", {
            headers: getAuthHeaders()
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Failed to load agents");
        }

        cachedAgents = data.agents || [];
        renderAgents(cachedAgents);
    }

    function resetAgentForm() {
        if (!createAgentForm) return;
        createAgentForm.reset();

        if (formMode) formMode.value = "create";
        if (editingAgentName) editingAgentName.value = "";
        if (createAgentModalTitle) createAgentModalTitle.textContent = "CREATE NEW AGENT";

        document.getElementById("agent-name").disabled = false;

        renderMiniPreview(profilePreviewWrap, "");
        renderMiniPreview(backgroundPreviewWrap, "");

        window.Visuals.clearAll();
        window.Visuals.addPoseRow();
        window.Visuals.addEmotionRow();
    }

    async function openEditAgent(agentName) {
        const res = await fetch(`http://127.0.0.1:5000/api/agents/${encodeURIComponent(agentName)}`, {
            headers: getAuthHeaders()
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error || "Agent load failed");
            return;
        }

        if (formMode) formMode.value = "edit";
        if (editingAgentName) editingAgentName.value = agentName;
        if (createAgentModalTitle) createAgentModalTitle.textContent = `EDIT AGENT: ${data.display_name || agentName}`;

        document.getElementById("agent-name").value = data.name || agentName;
        document.getElementById("agent-name").disabled = true;
        document.getElementById("agent-display-name-input").value = data.display_name || "";
        document.getElementById("agent-age").value = data.age || "";
        document.getElementById("agent-personality").value = data.personality || "";
        document.getElementById("agent-backstory").value = data.backstory || "";
        document.getElementById("agent-first-meeting").value = data.first_meeting || "";
        document.getElementById("agent-system-prompt").value = data.system_prompt || "";

        document.getElementById("agent-accent").value = data.theme?.accent || "#a10000";
        document.getElementById("agent-accent2").value = data.theme?.accent2 || "#ff1b1b";
        document.getElementById("agent-text-color").value = data.theme?.text || "#eeeeee";

        renderMiniPreview(profilePreviewWrap, data.profile_candidates?.[0] || "");
        renderMiniPreview(backgroundPreviewWrap, data.background_candidates?.[0] || "");

        window.Visuals.loadAgentVisuals(data);
        window.UIState.showCreateAgentModal();
    }

    function rgbaFromPanelPicker() {
        const panelHex = document.getElementById("panelColor").value;
        return window.Theme.hexToRGBA(panelHex, 0.94);
    }

    async function handleCreateAgentSubmit(e) {
        e.preventDefault();
        if (!createAgentForm) return;

        const mode = formMode?.value || "create";
        const agentName = editingAgentName?.value || "";
        const formData = new FormData(createAgentForm);
        const saveBtn = document.getElementById("save-agent-btn");
        const oldText = saveBtn ? saveBtn.textContent : "Save Agent";

        formData.set("panel", rgbaFromPanelPicker());

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = mode === "edit" ? "Updating..." : "Saving...";
        }

        try {
            const url = mode === "edit"
                ? `http://127.0.0.1:5000/api/agents/${encodeURIComponent(agentName)}/update`
                : "http://127.0.0.1:5000/api/agents/create";

            const res = await fetch(url, {
                method: "POST",
                headers: getAuthHeaders(),
                body: formData
            });

            const data = await res.json();

            if (res.status === 401) {
                alert("Şifre yanlış.");
                return;
            }

            if (!res.ok) {
                alert(data.error || "Save failed.");
                return;
            }

            await fetchAgents();
            window.UIState.hideCreateAgentModal();

            if (mode === "create") {
                const openNow = confirm(`${data.agent.display_name || data.agent.name} created successfully. Open chat now?`);
                if (openNow) window.App.initAgent(data.agent.name);
            } else {
                const reopen = confirm("Ajan güncellendi. Sohbeti açmak ister misin?");
                if (reopen) window.App.initAgent(data.agent.name);
            }
        } catch (err) {
            console.error("Save agent error:", err);
            alert("Could not save agent.");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = oldText;
            }
        }
    }

    async function confirmAgentsPassword() {
        const value = agentsPasswordInput.value.trim();
        if (!value) {
            alert("Şifre gir.");
            return;
        }

        try {
            const res = await fetch("http://127.0.0.1:5000/api/agents/auth", {
                method: "POST",
                headers: {
                    "X-Agents-Password": value
                }
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                agentsPassword = "";
                alert("Şifre yanlış.");
                return;
            }

            agentsPassword = value;
            window.UIState.hideAgentsPasswordModal();
            window.UIState.showAgentsScreen();
            await fetchAgents();
        } catch (err) {
            console.error("Password auth error:", err);
            alert("Şifre kontrol edilemedi.");
        }
    }

    function bindFilterButtons() {
        document.querySelectorAll(".agents-filter-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".agents-filter-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentFilter = btn.dataset.filter || "all";
                renderAgents(cachedAgents);
            });
        });
    }

    function bindPreviewInputs() {
        document.getElementById("agent-profile-image")?.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            renderMiniPreview(profilePreviewWrap, URL.createObjectURL(file));
        });

        document.getElementById("agent-background-image")?.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            renderMiniPreview(backgroundPreviewWrap, URL.createObjectURL(file));
        });
    }

    function bindEvents() {
        openAgentsBtn?.addEventListener("click", () => {
            window.UIState.showAgentsPasswordModal();
        });

        backToMainBtn?.addEventListener("click", () => {
            window.UIState.showMainMenu();
        });

        closeCreateAgentBtn?.addEventListener("click", () => {
            window.UIState.hideCreateAgentModal();
        });

        cancelCreateAgentBtn?.addEventListener("click", () => {
            window.UIState.hideCreateAgentModal();
        });

        agentSearch?.addEventListener("input", () => {
            renderAgents(cachedAgents);
        });

        createAgentForm?.addEventListener("submit", handleCreateAgentSubmit);

        agentsPasswordConfirmBtn?.addEventListener("click", confirmAgentsPassword);

        agentsPasswordCancelBtn?.addEventListener("click", () => {
            window.UIState.hideAgentsPasswordModal();
        });

        agentsPasswordInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") confirmAgentsPassword();
        });

        bindFilterButtons();
        bindPreviewInputs();
    }

    bindEvents();

    return {
        getPassword,
        fetchAgents
    };
})();