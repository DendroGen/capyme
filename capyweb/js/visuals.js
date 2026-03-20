window.Visuals = (() => {
    const chatEmotionBg = document.getElementById("chat-emotion-bg");

    function clearSceneVisual() {
        if (!chatEmotionBg) return;
        chatEmotionBg.style.backgroundImage = "";
        chatEmotionBg.classList.remove("show");
    }

    function applySceneVisual(sceneVisual) {
        if (!chatEmotionBg) return;
        if (!sceneVisual || !sceneVisual.image_url) {
            clearSceneVisual();
            return;
        }

        chatEmotionBg.style.backgroundImage = `url('${sceneVisual.image_url}')`;
        chatEmotionBg.classList.add("show");
    }

    return {
        applySceneVisual,
        clearSceneVisual,
    };
})();