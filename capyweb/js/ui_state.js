window.UIState = (() => {
    const selectorScreen = document.getElementById("selector-screen");
    const agentsScreen = document.getElementById("agents-screen");
    const createAgentModal = document.getElementById("create-agent-modal");
    const agentsPasswordModal = document.getElementById("agents-password-modal");
    const notesScreen = document.getElementById("notes-screen");
    const draggable = document.getElementById("draggable");
    const profileSidePanel = document.getElementById("profile-side-panel");

    function hideAllMainLayers() {
        if (selectorScreen) selectorScreen.classList.add("hidden");
        if (agentsScreen) agentsScreen.classList.add("hidden");
        if (createAgentModal) createAgentModal.classList.add("hidden");
        if (agentsPasswordModal) agentsPasswordModal.classList.add("hidden");
        if (notesScreen) notesScreen.classList.add("hidden");
        if (draggable) draggable.style.display = "none";
        if (profileSidePanel) profileSidePanel.classList.add("hidden");
    }

    function showMainMenu() {
        hideAllMainLayers();
        if (selectorScreen) selectorScreen.classList.remove("hidden");
    }

    function showAgentsScreen() {
        hideAllMainLayers();
        if (agentsScreen) agentsScreen.classList.remove("hidden");
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

    function showNotesScreen() {
        hideAllMainLayers();
        if (notesScreen) notesScreen.classList.remove("hidden");
    }

    function showChat() {
        hideAllMainLayers();
        if (draggable) draggable.style.display = "flex";
    }

    return {
        showMainMenu,
        showAgentsScreen,
        showCreateAgentModal,
        hideCreateAgentModal,
        showAgentsPasswordModal,
        hideAgentsPasswordModal,
        showNotesScreen,
        showChat,
    };
})();