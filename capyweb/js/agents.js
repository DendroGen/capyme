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

    const profileInput = document.getElementById("agent-profile-image");
    const backgroundInput = document.getElementById("agent-background-image");
    const profilePreview = document.getElementById("agent-profile-preview");
    const backgroundPreview = document.getElementById("agent-background-preview");

    const addPoseRowBtn = document.getElementById("add-pose-row-btn");
    const poseRows = document.getElementById("pose-rows");

    let cachedAgents = [];
    let agentsPassword = "";
    let editingAgentName = "";
    let poseRowIndex = 1;

    function getPassword() {
        return agentsPassword;
    }

    function getAuthHeaders() {
        return {
            "X-Agents-Password": agentsPassword
        };
    }

    function hexToRGBA(hex, alpha = 0.94) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function setImagePreview(imgEl, url) {
        if (!imgEl) return;
        if (url) {
            imgEl.src = url;
            imgEl.style.display = "block";
        } else {
            imgEl.removeAttribute("src");
            imgEl.style.display = "none";
        }
    }

    function bindLiveImagePreview(inputEl, previewEl) {
        if (!inputEl || !previewEl) return;

        inputEl.addEventListener("change", () => {
            const file = inputEl.files && inputEl.files[0];
            if (!file) return;

            const localUrl = URL.createObjectURL(file);
            previewEl.src = localUrl;
            previewEl.style.display = "block";
        });
    }

    async function resolveFirstExistingImage(candidates) {
        for (const url of candidates) {
            try {
                const res = await fetch(url, { method: "HEAD" });
                if (res.ok) return url;
            } catch (_) {}
        }
        return "";
    }

    function buildAgentImageCandidates(agentName, type) {
        const base = `http://127.0.0.1:5000/uigrounds/${agentName}`;

        if (type === "profile") {
            return [
                `${base}/profile.jpg`,
                `${base}/profile.png`,
                `${base}/profile.jpeg`,
                `${base}/profile.webp`,
                `${base}/avatar.jpg`,
                `${base}/avatar.png`,
                `${base}/avatar.jpeg`,
                `${base}/avatar.webp`
            ];
        }

        return [
            `${base}/background.jpg`,
            `${base}/background.png`,
            `${base}/background.jpeg`,
            `${base}/background.webp`,
            `${base}/bg.jpg`,
            `${base}/bg.png`,
            `${base}/bg.jpeg`,
            `${base}/bg.webp`
        ];
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
                    <div class="agent-browser-sub">Poses: ${agent.poses_count || 0} | Emotions: ${agent.emotions_count || 0}</div>

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
                resetCreateAgentForm();
                editingAgentName = "";
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
                await deleteAgent(agentName);
            });
        });

        document.querySelectorAll(".real-agent-card").forEach(card => {
            card.addEventListener("click", () => {
                const agentName = card.dataset.agentName;
                window.App.initAgent(agentName);
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

    function resetCreateAgentForm() {
        if (!createAgentForm) return;

        createAgentForm.reset();
        editingAgentName = "";
        poseRowIndex = 1;

        const originalNameInput = document.getElementById("agent-original-name");
        if (originalNameInput) {
            originalNameInput.value = "";
        }

        const panelColor = document.getElementById("panelColor");
        if (panelColor) panelColor.value = "#0c0606";

        if (poseRows) {
            poseRows.innerHTML = `
                <div class="visual-row">
                    <div class="form-group">
                        <label>Poz Resmi</label>
                        <input type="file" name="pose_image_0" accept="image/*">
                    </div>

                    <div class="form-group">
                        <label>Poz İsmi</label>
                        <input type="text" name="pose_label_0" placeholder="Ayakta yakın">
                    </div>

                    <div class="form-group full">
                        <label>Poz Açıklaması</label>
                        <textarea name="pose_description_0" rows="3" placeholder="Örnek: Ayak odaklı kıyafetli bir an. Karakter kameraya hafif yana dönük. Fiziksel sahne başlatmıyor ama vücut pozu belirgin."></textarea>
                    </div>

                    <div class="form-group full">
                        <label>Taglar</label>
                        <input type="text" name="pose_triggers_0" placeholder="Örnek: ayak,kıyafet,ayakta,uzanıyor,elini uzatıyor,oturuyor">
                    </div>
                </div>
            `;
        }

        setImagePreview(profilePreview, "");
        setImagePreview(backgroundPreview, "");
    }

    function addPoseRow() {
        if (!poseRows) return;

        const idx = poseRowIndex++;
        const div = document.createElement("div");
        div.className = "visual-row";
        div.innerHTML = `
            <div class="form-group">
                <label>Poz Resmi</label>
                <input type="file" name="pose_image_${idx}" accept="image/*">
            </div>

            <div class="form-group">
                <label>Poz İsmi</label>
                <input type="text" name="pose_label_${idx}" placeholder="Yeni poz">
            </div>

            <div class="form-group full">
                <label>Poz Açıklaması</label>
                <textarea name="pose_description_${idx}" rows="3" placeholder="Pozu açıkla"></textarea>
            </div>

            <div class="form-group full">
                <label>Taglar</label>
                <input type="text" name="pose_triggers_${idx}" placeholder="örnek: oturuyor,el,ayakta">
            </div>
        `;
        poseRows.appendChild(div);
    }

    async function openAgentSettings(agentName) {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/agents/${agentName}`);
            const agent = await res.json();

            if (!res.ok) {
                alert(agent.error || "Ajan yüklenemedi.");
                return;
            }

            resetCreateAgentForm();
            editingAgentName = agent.name;

            const originalNameInput = document.getElementById("agent-original-name");
            if (originalNameInput) {
                originalNameInput.value = agent.name || "";
            }

            document.getElementById("agent-name").value = agent.name || "";
            document.getElementById("agent-display-name-input").value = agent.display_name || "";
            document.getElementById("agent-age").value = agent.age || "";
            document.getElementById("agent-personality").value = agent.personality || "";
            document.getElementById("agent-backstory").value = agent.backstory || "";
            document.getElementById("agent-first-meeting").value = agent.first_meeting || "";
            document.getElementById("agent-system-prompt").value = agent.system_prompt || "";

            if (agent.theme) {
                if (agent.theme.accent) document.getElementById("agent-accent").value = agent.theme.accent;
                if (agent.theme.accent2) document.getElementById("agent-accent2").value = agent.theme.accent2;
                if (agent.theme.text) document.getElementById("agent-text-color").value = agent.theme.text;

                const panelMatch = (agent.theme.panel || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                if (panelMatch) {
                    const r = Number(panelMatch[1]).toString(16).padStart(2, "0");
                    const g = Number(panelMatch[2]).toString(16).padStart(2, "0");
                    const b = Number(panelMatch[3]).toString(16).padStart(2, "0");
                    document.getElementById("panelColor").value = `#${r}${g}${b}`;
                }
            }

            const profileUrl = await resolveFirstExistingImage(buildAgentImageCandidates(agent.name, "profile"));
            const backgroundUrl = await resolveFirstExistingImage(buildAgentImageCandidates(agent.name, "background"));

            setImagePreview(profilePreview, profileUrl);
            setImagePreview(backgroundPreview, backgroundUrl);

            if (poseRows) {
                poseRows.innerHTML = "";
                poseRowIndex = 0;

                const poses = agent.poses || [];
                if (poses.length === 0) {
                    addPoseRow();
                } else {
                    poses.forEach((pose) => {
                        const idx = poseRowIndex++;
                        const div = document.createElement("div");
                        div.className = "visual-row";
                        div.innerHTML = `
                            <div class="form-group full">
                                <label>Mevcut Poz</label>
                                <div class="existing-visual-line">
                                    <img src="${pose.image_url}" alt="${pose.label || "pose"}" class="existing-visual-thumb">
                                    <button type="button" class="agent-mini-btn delete-existing-visual-btn" data-kind="poses" data-key="${pose.key}">
                                        Sil
                                    </button>
                                </div>
                            </div>

                            <div class="form-group">
                                <label>Yeni Poz Resmi (istersen değiştir)</label>
                                <input type="file" name="pose_image_${idx}" accept="image/*">
                            </div>

                            <div class="form-group">
                                <label>Poz İsmi</label>
                                <input type="text" name="pose_label_${idx}" value="${pose.label || ""}">
                            </div>

                            <div class="form-group full">
                                <label>Poz Açıklaması</label>
                                <textarea name="pose_description_${idx}" rows="3">${pose.description || ""}</textarea>
                            </div>

                            <div class="form-group full">
                                <label>Taglar</label>
                                <input type="text" name="pose_triggers_${idx}" value="${(pose.triggers || []).join(",")}">
                            </div>
                        `;
                        poseRows.appendChild(div);
                    });
                }
            }

            window.UIState.showCreateAgentModal();

            document.querySelectorAll(".delete-existing-visual-btn").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const kind = btn.dataset.kind;
                    const key = btn.dataset.key;
                    const ok = confirm("Bu görsel silinsin mi?");
                    if (!ok) return;

                    try {
                        const res = await fetch(`http://127.0.0.1:5000/api/agents/${agent.name}/visuals/${kind}/${key}`, {
                            method: "DELETE",
                            headers: getAuthHeaders()
                        });

                        const data = await res.json();
                        if (!res.ok) {
                            alert(data.error || "Silinemedi.");
                            return;
                        }

                        await openAgentSettings(agent.name);
                        await fetchAgents();
                    } catch (_) {
                        alert("Silinemedi.");
                    }
                });
            });
        } catch (err) {
            console.error("Open settings error:", err);
            alert("Ajan ayarları açılamadı.");
        }
    }

    async function deleteAgent(agentName) {
        const ok = confirm(`${agentName} tamamen silinsin mi? Tüm dosyaları gider.`);
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
        } catch (_) {
            alert("Silinemedi.");
        }
    }

    async function uploadExtraPoses(agentName, formData) {
        const uploads = [];

        for (const [key, value] of formData.entries()) {
            if (!key.startsWith("pose_image_")) continue;
            if (!(value instanceof File) || !value.name) continue;

            const idx = key.split("_").pop();
            const label = formData.get(`pose_label_${idx}`) || "";
            const description = formData.get(`pose_description_${idx}`) || "";
            const triggers = formData.get(`pose_triggers_${idx}`) || "";

            const fd = new FormData();
            fd.append("image", value);
            fd.append("label", label);
            fd.append("description", description);
            fd.append("triggers", triggers);

            uploads.push(
                fetch(`http://127.0.0.1:5000/api/agents/${agentName}/pose/add`, {
                    method: "POST",
                    headers: getAuthHeaders(),
                    body: fd
                })
            );
        }

        if (uploads.length) {
            await Promise.all(uploads);
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

        if (editingAgentName) {
            formData.set("original_name", editingAgentName);
        }

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
                alert(data.error || "Failed to create agent.");
                return;
            }

            if (data.agent && data.agent.name) {
                await uploadExtraPoses(data.agent.name, formData);
            }

            await fetchAgents();

            if (data.agent && data.agent.name && window.App.getCurrentAgent && window.App.getCurrentAgent() === data.agent.name) {
                await window.App.initAgent(data.agent.name);
            }

            if (editingAgentName) {
                await openAgentSettings(data.agent.name);
                alert("Ajan güncellendi.");
            } else {
                window.UIState.hideCreateAgentModal();
                resetCreateAgentForm();

                const openNow = confirm(`${data.agent.display_name || data.agent.name} created successfully. Open chat now?`);
                if (openNow) {
                    window.App.initAgent(data.agent.name);
                }
            }
        } catch (err) {
            console.error("Create agent error:", err);
            alert("Could not create/update agent.");
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
            addPoseRowBtn.addEventListener("click", addPoseRow);
        }

        bindLiveImagePreview(profileInput, profilePreview);
        bindLiveImagePreview(backgroundInput, backgroundPreview);
    }

    bindEvents();

    return {
        getPassword,
        fetchAgents,
        openAgentSettings,
    };
})();