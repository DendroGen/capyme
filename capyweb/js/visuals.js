window.Visuals = (() => {
    let overlay = null;
    let hideTimer = null;

    function ensureOverlay() {
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.className = "scene-visual-overlay";

        const img = document.createElement("img");
        img.className = "scene-visual-image";
        img.alt = "scene visual";

        const caption = document.createElement("div");
        caption.className = "scene-visual-caption";

        overlay.appendChild(img);
        overlay.appendChild(caption);
        document.body.appendChild(overlay);

        return overlay;
    }

    function showSceneVisual(sceneVisual) {
        if (!sceneVisual || !sceneVisual.image_url) return;

        const el = ensureOverlay();
        const img = el.querySelector(".scene-visual-image");
        const caption = el.querySelector(".scene-visual-caption");

        img.src = sceneVisual.image_url;
        caption.textContent = sceneVisual.label || sceneVisual.description || "";

        clearTimeout(hideTimer);
        el.classList.add("show");

        hideTimer = setTimeout(() => {
            el.classList.remove("show");
        }, 15000);
    }

    return {
        showSceneVisual,
    };
})();