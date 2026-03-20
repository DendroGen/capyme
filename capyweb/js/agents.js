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

    let cachedAgents = [];
    let agentsPassword = "";

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
                window.UIState.showCreateAgentModal();
            });
        }

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

    function hexToRGBA(hex, alpha = 0.94) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
            saveBtn.textContent = "Saving...";
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

            window.UIState.hideCreateAgentModal();
            createAgentForm.reset();
            await fetchAgents();

            if (data.agent && data.agent.name) {
                const openNow = confirm(`${data.agent.display_name || data.agent.name} created successfully. Open chat now?`);
                if (openNow) {
                    window.App.initAgent(data.agent.name);
                }
            }
        } catch (err) {
            console.error("Create agent error:", err);
            alert("Could not create agent.");
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
    }

    bindEvents();

    return {
        getPassword,
        fetchAgents,
    };
})();