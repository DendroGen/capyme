window.Theme = (() => {
    const root = document.documentElement;

    const DEFAULT_THEME = {
        accent: "#a10000",
        accent2: "#ff1b1b",
        text: "#eeeeee",
        panel: "rgba(12, 6, 6, 0.94)"
    };

    function hexToRGBA(hex, alpha = 0.94) {
        if (!hex || typeof hex !== "string" || !hex.startsWith("#") || hex.length < 7) {
            return `rgba(12, 6, 6, ${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function applyTheme(theme = {}) {
        const t = {
            ...DEFAULT_THEME,
            ...(theme || {})
        };

        root.style.setProperty("--accent", t.accent);
        root.style.setProperty("--accent-2", t.accent2);
        root.style.setProperty("--accent2", t.accent2);
        root.style.setProperty("--text", t.text);
        root.style.setProperty("--panel", t.panel);

        root.style.setProperty("--border", t.accent);
        root.style.setProperty("--nixie", t.accent2);
        root.style.setProperty("--panel-2", t.panel);
        root.style.setProperty("--muted", t.text);
        root.style.setProperty("--shadow", `0 0 24px ${hexToRGBA(t.accent, 0.28)}`);
    }

    function getDefaultTheme() {
        return { ...DEFAULT_THEME };
    }

    return {
        hexToRGBA,
        applyTheme,
        getDefaultTheme
    };
})();