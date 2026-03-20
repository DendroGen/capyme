const selectorScreen = document.getElementById("selector-screen");
const agentsScreen = document.getElementById("agents-screen");
const createAgentModal = document.getElementById("create-agent-modal");

const openAgentsBtn = document.getElementById("open-agents-btn");
const backToMainBtn = document.getElementById("back-to-main-btn");
const closeCreateAgentBtn = document.getElementById("close-create-agent-btn");
const cancelCreateAgentBtn = document.getElementById("cancel-create-agent-btn");

const agentsGrid = document.getElementById("agents-grid");
const agentSearch = document.getElementById("agent-search");
const createAgentForm = document.getElementById("create-agent-form");

let cachedAgents = [];

/* # SCREEN HELPERS */
function showMainMenu() {
    selectorScreen.classList.remove("hidden");
    agentsScreen.classList.add("hidden");
    createAgentModal.classList.add("hidden");
}

function showAgentsScreen() {
    selectorScreen.classList.add("hidden");
    agentsScreen.classList.remove("hidden");
}

function showCreateAgentModal() {
    createAgentModal.classList.remove("hidden");
}

function hideCreateAgentModal() {
    createAgentModal.classList.add("hidden");
    createAgentForm.reset();

    const accent = document.getElementById("agent-accent");
    const accent2 = document.getElementById("agent-accent2");
    const textColor = document.getElementById("agent-text-color");
    const panel = document.getElementById("agent-panel");

    if (accent) accent.value = "#a10000";
    if (accent2) accent2.value = "#ff1b1b";
    if (textColor) textColor.value = "#eeeeee";
    if (panel) panel.value = "rgba(12, 6, 6, 0.94)";
}

/* # RENDER */
function createAgentCardHTML(agent) {
    const img = agent.profile_url || "http://127.0.0.1:5000/uigrounds/Makise_Kurisu/profile.jpg";
    const personality = (agent.personality || "No personality description.")
        .slice(0, 95);

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
    const query = (agentSearch.value || "").trim().toLowerCase();

    const filtered = agentList.filter(agent => {
        const a = `${agent.display_name} ${agent.name} ${agent.personality || ""}`.toLowerCase();
        return a.includes(query);
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

    agentsGrid.innerHTML =
        createCard +
        filtered.map(createAgentCardHTML).join("");

    const createCardEl = document.getElementById("agent-create-card");
    if (createCardEl) {
        createCardEl.addEventListener("click", showCreateAgentModal);
    }

    document.querySelectorAll(".real-agent-card").forEach(card => {
        card.addEventListener("click", () => {
            const agentName = card.dataset.agentName;
            initAgent(agentName);
        });
    });
}

/* # API */
async function fetchAgents() {
    try {
        const res = await fetch("http://127.0.0.1:5000/api/agents");
        const data = await res.json();
        cachedAgents = data.agents || [];
        renderAgents(cachedAgents);
    } catch (err) {
        console.error("Agents fetch error:", err);
        agentsGrid.innerHTML = `
            <div class="agent-browser-card agent-create-card" id="agent-create-card">
                <div class="agent-browser-content" style="align-items:center; justify-content:center; text-align:center;">
                    <div class="agent-create-plus">!</div>
                    <div class="agent-browser-title">Failed to load agents</div>
                    <div class="agent-browser-sub">Backend connection error</div>
                </div>
            </div>
        `;
    }
}

/* # CREATE AGENT */
async function handleCreateAgentSubmit(e) {
    e.preventDefault();

    const formData = new FormData(createAgentForm);
    const saveBtn = document.getElementById("save-agent-btn");
    const oldText = saveBtn.textContent;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
        const res = await fetch("http://127.0.0.1:5000/api/agents/create", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Failed to create agent.");
            return;
        }

        hideCreateAgentModal();
        await fetchAgents();

        if (data.agent && data.agent.name) {
            const openNow = confirm(`${data.agent.display_name || data.agent.name} created successfully. Open chat now?`);
            if (openNow) {
                initAgent(data.agent.name);
            }
        }

    } catch (err) {
        console.error("Create agent error:", err);
        alert("Could not create agent.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = oldText;
    }
}

/* # EVENTS */
if (openAgentsBtn) {
    openAgentsBtn.addEventListener("click", async () => {
        showAgentsScreen();
        await fetchAgents();
    });
}

if (backToMainBtn) {
    backToMainBtn.addEventListener("click", showMainMenu);
}

if (closeCreateAgentBtn) {
    closeCreateAgentBtn.addEventListener("click", hideCreateAgentModal);
}

if (cancelCreateAgentBtn) {
    cancelCreateAgentBtn.addEventListener("click", hideCreateAgentModal);
}

if (agentSearch) {
    agentSearch.addEventListener("input", () => {
        renderAgents(cachedAgents);
    });
}

if (createAgentForm) {
    createAgentForm.addEventListener("submit", handleCreateAgentSubmit);
}

if (createAgentModal) {
    createAgentModal.addEventListener("click", (e) => {
        if (e.target === createAgentModal) {
            hideCreateAgentModal();
        }
    });
}