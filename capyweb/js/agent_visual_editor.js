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
    const deleteAgentBtn = document.getElementById("delete-agent-btn");

    const originalAgentNameInput = document.getElementById("original-agent-name");
    const currentProfilePreview = document.getElementById("current-profile-preview");
    const currentBackgroundPreview = document.getElementById("current-background-preview");

    const poseRows = document.getElementById("pose-rows");
    const emotionRows = document.getElementById("emotion-rows");
    const addPoseRowBtn = document.getElementById("add-pose-row-btn");
    const addEmotionRowBtn = document.getElementById("add-emotion-row-btn");

    const agentNameInput = document.getElementById("agent-name");
    const displayNameInput = document.getElementById("agent-display-name-input");
    const ageInput = document.getElementById("agent-age");
    const accentInput = document.getElementById("agent-accent");
    const accent2Input = document.getElementById("agent-accent2");
    const textInput = document.getElementById("agent-text-color");
    const panelColorInput = document.getElementById("panelColor");
    const personalityInput = document.getElementById("agent-personality");
    const backstoryInput = document.getElementById("agent-backstory");
    const firstMeetingInput = document.getElementById("agent-first-meeting");
    const systemPromptInput = document.getElementById("agent-system-prompt");

    let cachedAgents = [];
    let agentsPassword = "";

    function getAuthHeaders() {
        return {
            "X-Agents-Password": agentsPassword
        };
    }

    function getPassword() {
        return agentsPassword;
    }

    function getProfileUrl(agent) {
        return agent.profile_url || "http://127.0.0.1:5000/uigrounds/Makise_Kurisu/profile.jpg";
    }

    function createAgentCardHTML(agent) {
        const img = getProfileUrl(agent);
        const personality = (agent.personality || "No personality description.").slice(0, 95);

        return `
            <div class="agent-browser-card real-agent-card" data-agent-name="${agent.name}">
                <img src="${img}" alt="${agent.display_name}">
                <div class="agent-browser-content">
                    <div class="agent-browser-title">${agent.display_name}</div>
                    <div class="agent-browser-sub">${personality}${personality.length >= 95 ? "..." : ""}</div>
                    <div class="agent-browser-sub">Poses: ${agent.poses_count || 0} | Emotions: ${agent.emotions_count || 0}</div>
                    <div class="agent-browser-actions">
                        <button type="button" class="agent-mini-btn open-chat-btn" data-agent-name="${agent.name}">Open</button>
                        <button type="button" class="agent-mini-btn open-settings-btn" data-agent-name="${agent.name}">Settings</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderAgents(agentList) {
        if (!agentsGrid) return;

        const query = ((agentSearch && agentSearch.value) || "").trim().toLowerCase();

        const filtered = agentList.filter(agent => {
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

        const createCardEl = document.getElementById("agent-create-card");
        if (createCardEl) {
            createCardEl.addEventListener("click", () => {
                resetAgentForm();
                window.UIState.showCreateAgentModal();
            });
        }

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
                await loadAgentIntoForm(agentName);
                window.UIState.showCreateAgentModal();
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

    function makeVisualRow(kind, index, existing = null) {
        const wrapper = document.createElement("div");
        wrapper.className = "visual-row";
        wrapper.dataset.kind = kind;
        wrapper.dataset.index = String(index);
        wrapper.dataset.existingKey = existing?.key || "";

        wrapper.innerHTML = `
            <div class="form-group">
                <label>${kind === "pose" ? "Poz Resmi" : "Duygu Resmi"}</label>
                <input type="file" accept="image/*" class="visual-file-input">
            </div>

            <div class="form-group">
                <label>${kind === "pose" ? "Poz İsmi" : "Duygu İsmi"}</label>
                <input type="text" class="visual-label-input" placeholder="${kind === "pose" ? "Ayakta yakın" : "Utanmış"}" value="${existing?.label || ""}">
            </div>

            <div class="form-group full">
                <label>Açıklama</label>
                <textarea class="visual-description-input" rows="3" placeholder="Örnek: ayak odaklı kıyafetli bir an, yüz odaklı utangaç ifade, oturuyor, elini uzatıyor...">${existing?.description || ""}</textarea>
            </div>

            <div class="form-group full">
                <label>Taglar</label>
                <input type="text" class="visual-triggers-input" placeholder="Örnek: ayak,kıyafet,oturuyor,utangaç,elini uzatıyor" value="${(existing?.triggers || []).join(", ")}">
            </div>

            <div class="visual-preview-card ${existing?.image_url ? "" : "hidden"}">
                <img class="visual-preview-image" src="${existing?.image_url || ""}" alt="preview">
                <div>
                    <div>${existing?.label || ""}</div>
                    <div style="font-size:11px; color:#bbb;">${existing?.key || ""}</div>
                </div>
                <button type="button" class="btn danger delete-visual-btn" style="margin-left:auto;">Sil</button>
            </div>
        `;

        const fileInput = wrapper.querySelector(".visual-file-input");
        const previewCard = wrapper.querySelector(".visual-preview-card");
        const previewImage = wrapper.querySelector(".visual-preview-image");

        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            previewImage.src = url;
            previewCard.classList.remove("hidden");
        });

        const deleteBtn = wrapper.querySelector(".delete-visual-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", async () => {
                const agent = originalAgentNameInput.value.trim();
                const key = wrapper.dataset.existingKey;
                if (!agent || !key) {
                    wrapper.remove();
                    return;
                }

                const ok = confirm("Bu görsel silinsin mi?");
                if (!ok) return;

                const kindPath = kind === "pose" ? "poses" : "emotions";

                const res = await fetch(`http://127.0.0.1:5000/api/agents/${agent}/visuals/${kindPath}/${encodeURIComponent(key)}`, {
                    method: "DELETE",
                    headers: getAuthHeaders()
                });

                const data = await res.json();
                if (!res.ok) {
                    alert(data.error || "Visual silinemedi.");
                    return;
                }

                wrapper.remove();
            });
        }

        return wrapper;
    }

    function addPoseRow(existing = null) {
        const index = poseRows.children.length;
        poseRows.appendChild(makeVisualRow("pose", index, existing));
    }

    function addEmotionRow(existing = null) {
        const index = emotionRows.children.length;
        emotionRows.appendChild(makeVisualRow("emotion", index, existing));
    }

    function resetAgentForm() {
        createAgentForm.reset();
        originalAgentNameInput.value = "";
        poseRows.innerHTML = "";
        emotionRows.innerHTML = "";
        addPoseRow();
        addEmotionRow();
        currentProfilePreview.classList.add("hidden");
        currentBackgroundPreview.classList.add("hidden");
        deleteAgentBtn.classList.add("hidden");
        document.getElementById("agent-modal-title").textContent = "CREATE / EDIT AGENT";
    }

    async function loadAgentIntoForm(agentName) {
        const res = await fetch(`http://127.0.0.1:5000/api/agents/${agentName}`);
        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Agent yüklenemedi.");
            return;
        }

        resetAgentForm();

        originalAgentNameInput.value = data.name || agentName;
        agentNameInput.value = data.name || "";
        displayNameInput.value = data.display_name || "";
        ageInput.value = data.age || "";
        personalityInput.value = data.personality || "";
        backstoryInput.value = data.backstory || "";
        firstMeetingInput.value = data.first_meeting || "";
        systemPromptInput.value = data.system_prompt || "";

        if (data.theme?.accent) accentInput.value = data.theme.accent;
        if (data.theme?.accent2) accent2Input.value = data.theme.accent2;
        if (data.theme?.text) textInput.value = data.theme.text;

        if (data.theme?.panel) {
            const match = data.theme.panel.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (match) {
                const r = Number(match[1]).toString(16).padStart(2, "0");
                const g = Number(match[2]).toString(16).padStart(2, "0");
                const b = Number(match[3]).toString(16).padStart(2, "0");
                panelColorInput.value = `#${r}${g}${b}`;
            }
        }

        const agentDir = `http://127.0.0.1:5000/uigrounds/${data.name}`;

        currentProfilePreview.textContent = `Mevcut profil resmi: ${agentDir}/profile.*`;
        currentProfilePreview.classList.remove("hidden");

        currentBackgroundPreview.textContent = `Mevcut arka plan: ${agentDir}/background.*`;
        currentBackgroundPreview.classList.remove("hidden");

        poseRows.innerHTML = "";
        emotionRows.innerHTML = "";

        (data.poses || []).forEach(item => addPoseRow(item));
        (data.emotions || []).forEach(item => addEmotionRow(item));

        if (!data.poses || data.poses.length === 0) addPoseRow();
        if (!data.emotions || data.emotions.length === 0) addEmotionRow();

        deleteAgentBtn.classList.remove("hidden");
        document.getElementById("agent-modal-title").textContent = `EDIT AGENT: ${data.display_name || data.name}`;
    }

    async function uploadVisuals(agentName) {
        const uploadOne = async (kind, row) => {
            const fileInput = row.querySelector(".visual-file-input");
            const labelInput = row.querySelector(".visual-label-input");
            const descriptionInput = row.querySelector(".visual-description-input");
            const triggersInput = row.querySelector(".visual-triggers-input");

            const file = fileInput?.files?.[0];
            if (!file) return;

            const fd = new FormData();
            fd.append("image", file);
            fd.append("label", labelInput?.value || "");
            fd.append("description", descriptionInput?.value || "");
            fd.append("triggers", triggersInput?.value || "");

            const endpoint = kind === "pose"
                ? `http://127.0.0.1:5000/api/agents/${agentName}/pose/add`
                : `http://127.0.0.1:5000/api/agents/${agentName}/emotion/add`;

            const res = await fetch(endpoint, {
                method: "POST",
                headers: getAuthHeaders(),
                body: fd
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `${kind} upload failed`);
            }
        };

        const poseList = [...poseRows.querySelectorAll(".visual-row")];
        const emotionList = [...emotionRows.querySelectorAll(".visual-row")];

        for (const row of poseList) await uploadOne("pose", row);
        for (const row of emotionList) await uploadOne("emotion", row);
    }

    async function handleCreateAgentSubmit(e) {
        e.preventDefault();

        const formData = new FormData(createAgentForm);
        const saveBtn = document.getElementById("save-agent-btn");
        const oldText = saveBtn.textContent;

        const panelHex = document.getElementById("panelColor").value;
        const panelRGBA = window.Theme.hexToRGBA(panelHex, 0.94);
        formData.set("panel", panelRGBA);

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        try {
            const res = await fetch("http://127.0.0.1:5000/api/agents/create", {
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
                alert(data.error || "Agent save failed.");
                return;
            }

            const finalAgentName = data.agent?.name;
            if (finalAgentName) {
                await uploadVisuals(finalAgentName);
            }

            await fetchAgents();
            await loadAgentIntoForm(finalAgentName);
            alert(data.mode === "updated" ? "Ajan güncellendi." : "Ajan oluşturuldu.");
        } catch (err) {
            console.error(err);
            alert("Kaydetme başarısız.");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = oldText;
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
            console.error(err);
            alert("Şifre kontrol edilemedi.");
        }
    }

    async function deleteCurrentAgent() {
        const agentName = originalAgentNameInput.value.trim();
        if (!agentName) return;

        const ok = confirm(`${agentName} tamamen silinsin mi? Bu işlem geri alınmaz.`);
        if (!ok) return;

        const res = await fetch(`http://127.0.0.1:5000/api/agents/${encodeURIComponent(agentName)}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error || "Silinemedi.");
            return;
        }

        resetAgentForm();
        window.UIState.hideCreateAgentModal();
        await fetchAgents();
        alert("Ajan silindi.");
    }

    function bindEvents() {
        if (openAgentsBtn) {
            openAgentsBtn.addEventListener("click", () => {
                window.UIState.showAgentsPasswordModal();
            });
        }

        if (backToMainBtn) {
            backToMainBtn.addEventListener("click", () => {
                window.UIState.showMainMenu();
            });
        }

        if (closeCreateAgentBtn) {
            closeCreateAgentBtn.addEventListener("click", () => {
                window.UIState.hideCreateAgentModal();
            });
        }

        if (cancelCreateAgentBtn) {
            cancelCreateAgentBtn.addEventListener("click", () => {
                window.UIState.hideCreateAgentModal();
            });
        }

        if (agentSearch) {
            agentSearch.addEventListener("input", () => {
                renderAgents(cachedAgents);
            });
        }

        if (createAgentForm) {
            createAgentForm.addEventListener("submit", handleCreateAgentSubmit);
        }

        if (agentsPasswordConfirmBtn) {
            agentsPasswordConfirmBtn.addEventListener("click", confirmAgentsPassword);
        }

        if (agentsPasswordCancelBtn) {
            agentsPasswordCancelBtn.addEventListener("click", () => {
                window.UIState.hideAgentsPasswordModal();
            });
        }

        if (agentsPasswordInput) {
            agentsPasswordInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    confirmAgentsPassword();
                }
            });
        }

        if (addPoseRowBtn) {
            addPoseRowBtn.addEventListener("click", () => addPoseRow());
        }

        if (addEmotionRowBtn) {
            addEmotionRowBtn.addEventListener("click", () => addEmotionRow());
        }

        if (deleteAgentBtn) {
            deleteAgentBtn.addEventListener("click", deleteCurrentAgent);
        }
    }

    bindEvents();
    resetAgentForm();

    return {
        getPassword,
        fetchAgents,
        loadAgentIntoForm,
        resetAgentForm,
    };
})();