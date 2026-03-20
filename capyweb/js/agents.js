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
    const addPoseRowBtn = document.getElementById("add-pose-row-btn");
    const addEmotionRowBtn = document.getElementById("add-emotion-row-btn");

    let cachedAgents = [];
    let agentsPassword = "";
    let editingAgentName = null;

    function getPassword() {
        return agentsPassword;
    }

    function getAuthHeaders() {
        return {
            "X-Agents-Password": agentsPassword
        };
    }

    function createAgentCardHTML(agent) {
        const img = agent.profile_url || "http://127.0.0.1:5000/uigrounds/Makise_Kurisu/profile.jpg";
        const personality = (agent.personality || "No personality description.").slice(0, 95);

        return `
            <div class="agent-browser-card real-agent-card" data-agent-name="${agent.name}">
                <img src="${img}" alt="${agent.display_name}">
                <div class="agent-browser-content">
                    <div class="agent-browser-title">${agent.display_name}</div>
                    <div class="agent-browser-sub">${personality}${personality.length >= 95 ? "..." : ""}</div>

                    <div class="agent-browser-actions">
                        <button type="button" class="agent-mini-btn open-chat-btn" data-agent-name="${agent.name}">
                            Open
                        </button>
                        <button type="button" class="agent-mini-btn open-settings-btn" data-agent-name="${agent.name}">
                            Settings
                        </button>
                        <button type="button" class="agent-mini-btn delete-agent-btn" data-agent-name="${agent.name}">
                            Delete
                        </button>
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
                resetCreateFormForNewAgent();
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
                await openAgentSettings(agentName);
            });
        });

        document.querySelectorAll(".delete-agent-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const agentName = btn.dataset.agentName;
                const ok = confirm(`${agentName} tamamen silinsin mi? Bu işlem geri alınmaz.`);
                if (!ok) return;

                try {
                    const res = await fetch(`http://127.0.0.1:5000/api/agents/${agentName}`, {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        alert(data.error || "Silinemedi.");
                        return;
                    }

                    await fetchAgents();
                } catch (err) {
                    console.error(err);
                    alert("Ajan silinemedi.");
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

    function hexToRGBA(hex, alpha = 0.94) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function rgbaToHexSafe(rgba) {
        if (!rgba) return null;
        const match = rgba.match(/\d+/g);
        if (!match || match.length < 3) return null;

        const r = parseInt(match[0], 10).toString(16).padStart(2, "0");
        const g = parseInt(match[1], 10).toString(16).padStart(2, "0");
        const b = parseInt(match[2], 10).toString(16).padStart(2, "0");

        return `#${r}${g}${b}`;
    }

    function makeVisualRow(type, index, item = {}) {
        const isPose = type === "pose";
        const preview = item.image_url
            ? `<div class="visual-preview-card">
                    <img src="${item.image_url}" class="visual-preview-image" alt="${item.label || ""}">
                    <button type="button" class="agent-mini-btn delete-visual-btn"
                        data-kind="${isPose ? "poses" : "emotions"}"
                        data-key="${item.key || ""}">
                        Delete
                    </button>
               </div>`
            : "";

        return `
            <div class="visual-row">
                <div class="form-group">
                    <label>${isPose ? "Poz Resmi" : "Duygu Resmi"}</label>
                    <input type="file" name="${type}_image_${index}" accept="image/*">
                </div>

                <div class="form-group">
                    <label>${isPose ? "Poz İsmi" : "Duygu İsmi"}</label>
                    <input type="text" name="${type}_label_${index}" value="${item.label || ""}" placeholder="${isPose ? "Ayakta yakın" : "Utanmış hafif"}">
                </div>

                <div class="form-group full">
                    <label>${isPose ? "Poz Açıklaması" : "Duygu Açıklaması"}</label>
                    <textarea name="${type}_description_${index}" rows="3">${item.description || ""}</textarea>
                </div>

                <div class="form-group full">
                    <label>Taglar</label>
                    <input type="text" name="${type}_triggers_${index}" value="${(item.triggers || []).join(",")}" placeholder="${isPose ? "ayak,kıyafet,ayakta,oturuyor" : "utanmış,mahcup,blush"}">
                </div>

                <input type="hidden" name="${type}_existing_key_${index}" value="${item.key || ""}">
                ${preview}
            </div>
        `;
    }

    function bindDeleteVisualButtons() {
        document.querySelectorAll(".delete-visual-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!editingAgentName) return;

                const kind = btn.dataset.kind;
                const key = btn.dataset.key;
                const ok = confirm("Bu visual silinsin mi?");
                if (!ok) return;

                try {
                    const res = await fetch(`http://127.0.0.1:5000/api/agents/${editingAgentName}/visuals/${kind}/${encodeURIComponent(key)}`, {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        alert(data.error || "Silinemedi");
                        return;
                    }

                    await openAgentSettings(editingAgentName);
                } catch (e) {
                    console.error(e);
                    alert("Silinemedi");
                }
            };
        });
    }

    function fillVisualRows(type, items) {
        const container = document.getElementById(type === "pose" ? "pose-rows" : "emotion-rows");
        if (!container) return;

        if (!items || !items.length) {
            container.innerHTML = makeVisualRow(type, 0);
            return;
        }

        container.innerHTML = items.map((item, i) => makeVisualRow(type, i, item)).join("");
        bindDeleteVisualButtons();
    }

    function resetCreateFormForNewAgent() {
        if (!createAgentForm) return;
        editingAgentName = null;
        createAgentForm.reset();

        let originalName = document.getElementById("original-agent-name");
        if (!originalName) {
            originalName = document.createElement("input");
            originalName.type = "hidden";
            originalName.id = "original-agent-name";
            originalName.name = "original_name";
            createAgentForm.appendChild(originalName);
        }
        originalName.value = "";

        const panelColor = document.getElementById("panelColor");
        if (panelColor) panelColor.value = "#0c0606";

        fillVisualRows("pose", []);
        fillVisualRows("emotion", []);
    }

    async function uploadVisualRows(agentName, type) {
        const container = document.getElementById(type === "pose" ? "pose-rows" : "emotion-rows");
        if (!container) return;

        const rows = [...container.querySelectorAll(".visual-row")];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            const imageInput = row.querySelector(`input[name="${type}_image_${i}"]`);
            const labelInput = row.querySelector(`input[name="${type}_label_${i}"]`);
            const descInput = row.querySelector(`textarea[name="${type}_description_${i}"]`);
            const trigInput = row.querySelector(`input[name="${type}_triggers_${i}"]`);

            if (!imageInput || !imageInput.files || !imageInput.files[0]) continue;

            const fd = new FormData();
            fd.append("image", imageInput.files[0]);
            fd.append("label", labelInput?.value || "");
            fd.append("description", descInput?.value || "");
            fd.append("triggers", trigInput?.value || "");

            const endpoint = type === "pose"
                ? `http://127.0.0.1:5000/api/agents/${agentName}/pose/add`
                : `http://127.0.0.1:5000/api/agents/${agentName}/emotion/add`;

            const res = await fetch(endpoint, {
                method: "POST",
                headers: getAuthHeaders(),
                body: fd
            });

            const data = await res.json();
            if (!res.ok) {
                console.error(`${type} upload error:`, data);
            }
        }
    }

    async function openAgentSettings(agentName) {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/agents/${agentName}`, {
                headers: getAuthHeaders()
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Agent settings yüklenemedi.");
                return;
            }

            editingAgentName = agentName;
            window.UIState.showCreateAgentModal();

            let originalName = document.getElementById("original-agent-name");
            if (!originalName) {
                originalName = document.createElement("input");
                originalName.type = "hidden";
                originalName.id = "original-agent-name";
                originalName.name = "original_name";
                createAgentForm.appendChild(originalName);
            }
            originalName.value = data.name || "";

            document.getElementById("agent-name").value = data.name || "";
            document.getElementById("agent-display-name-input").value = data.display_name || "";
            document.getElementById("agent-age").value = data.age || "";
            document.getElementById("agent-personality").value = data.personality || "";
            document.getElementById("agent-backstory").value = data.backstory || "";
            document.getElementById("agent-first-meeting").value = data.first_meeting || "";
            document.getElementById("agent-system-prompt").value = data.system_prompt || "";

            if (data.theme?.accent) document.getElementById("agent-accent").value = data.theme.accent;
            if (data.theme?.accent2) document.getElementById("agent-accent2").value = data.theme.accent2;
            if (data.theme?.text) document.getElementById("agent-text-color").value = data.theme.text;

            if (data.theme?.panel) {
                const hex = rgbaToHexSafe(data.theme.panel);
                if (hex) document.getElementById("panelColor").value = hex;
            }

            fillVisualRows("pose", data.poses || []);
            fillVisualRows("emotion", data.emotions || []);
        } catch (err) {
            console.error(err);
            alert("Settings yüklenemedi.");
        }
    }

    async function handleCreateAgentSubmit(e) {
        e.preventDefault();
        if (!createAgentForm) return;

        const formData = new FormData(createAgentForm);
        const saveBtn = document.getElementById("save-agent-btn");
        const oldText = saveBtn ? saveBtn.textContent : "Save Agent";

        const panelHex = document.getElementById("panelColor").value;
        const panelRGBA = hexToRGBA(panelHex, 0.94);
        formData.set("panel", panelRGBA);

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = editingAgentName ? "Updating..." : "Saving...";
        }

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
                alert(data.error || "Failed to save agent.");
                return;
            }

            const savedAgentName = data.agent.name;

            await uploadVisualRows(savedAgentName, "pose");
            await uploadVisualRows(savedAgentName, "emotion");

            window.UIState.hideCreateAgentModal();
            createAgentForm.reset();
            editingAgentName = null;
            fillVisualRows("pose", []);
            fillVisualRows("emotion", []);
            await fetchAgents();

            const openNow = confirm(`${data.agent.display_name || data.agent.name} saved successfully. Open chat now?`);
            if (openNow) {
                window.App.initAgent(data.agent.name);
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
            addPoseRowBtn.addEventListener("click", () => {
                const container = document.getElementById("pose-rows");
                const index = container.children.length;
                container.insertAdjacentHTML("beforeend", makeVisualRow("pose", index));
            });
        }

        if (addEmotionRowBtn) {
            addEmotionRowBtn.addEventListener("click", () => {
                const container = document.getElementById("emotion-rows");
                const index = container.children.length;
                container.insertAdjacentHTML("beforeend", makeVisualRow("emotion", index));
            });
        }
    }

    fillVisualRows("pose", []);
    fillVisualRows("emotion", []);
    bindEvents();

    return {
        getPassword,
        fetchAgents,
    };
})();