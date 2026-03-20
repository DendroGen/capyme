window.UIState = (() => {
    const selectorScreen = document.getElementById("selector-screen");
    const agentsScreen = document.getElementById("agents-screen");
    const createAgentModal = document.getElementById("create-agent-modal");
    const agentsPasswordModal = document.getElementById("agents-password-modal");
    const draggable = document.getElementById("draggable");
    const profileSidePanel = document.getElementById("profile-side-panel");

    function showMainMenu() {
        if (selectorScreen) {
            selectorScreen.classList.remove("hidden");
            selectorScreen.style.display = "flex";
        }
        if (agentsScreen) agentsScreen.classList.add("hidden");
        if (createAgentModal) createAgentModal.classList.add("hidden");
        if (agentsPasswordModal) agentsPasswordModal.classList.add("hidden");
        if (draggable) draggable.style.display = "none";
        if (profileSidePanel) profileSidePanel.classList.add("hidden");
    }

    function showAgentsScreen() {
        if (selectorScreen) selectorScreen.classList.add("hidden");
        if (agentsScreen) {
            agentsScreen.classList.remove("hidden");
            agentsScreen.style.display = "flex";
        }
        if (createAgentModal) createAgentModal.classList.add("hidden");
        if (agentsPasswordModal) agentsPasswordModal.classList.add("hidden");
    }

    function hideAgentsScreen() {
        if (agentsScreen) agentsScreen.classList.add("hidden");
    }

    function showChat() {
        if (selectorScreen) selectorScreen.classList.add("hidden");
        if (agentsScreen) agentsScreen.classList.add("hidden");
        if (createAgentModal) createAgentModal.classList.add("hidden");
        if (agentsPasswordModal) agentsPasswordModal.classList.add("hidden");
        if (draggable) draggable.style.display = "flex";
    }

    function showCreateAgentModal() {
        if (createAgentModal) createAgentModal.classList.remove("hidden");
    }

    function hideCreateAgentModal() {
        if (createAgentModal) createAgentModal.classList.add("hidden");
    }

    function showAgentsPasswordModal() {
        if (agentsPasswordModal) agentsPasswordModal.classList.remove("hidden");
    }

    function hideAgentsPasswordModal() {
        if (agentsPasswordModal) agentsPasswordModal.classList.add("hidden");
    }

    return {
        showMainMenu,
        showAgentsScreen,
        hideAgentsScreen,
        showChat,
        showCreateAgentModal,
        hideCreateAgentModal,
        showAgentsPasswordModal,
        hideAgentsPasswordModal,
    };
})();