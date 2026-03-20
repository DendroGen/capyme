window.ThemeManager = (() => {
    function applyTheme(theme = {}) {
        const root = document.documentElement;

        if (theme.accent) {
            root.style.setProperty("--accent", theme.accent);
            root.style.setProperty("--border", theme.accent);
        }

        if (theme.accent2) {
            root.style.setProperty("--accent2", theme.accent2);
            root.style.setProperty("--accent-2", theme.accent2);
            root.style.setProperty("--nixie", theme.accent2);
        }

        if (theme.panel) {
            root.style.setProperty("--panel", theme.panel);
            root.style.setProperty("--panel-2", theme.panel);
        }

        if (theme.text) {
            root.style.setProperty("--text", theme.text);
            root.style.setProperty("--muted", theme.text);
        }
    }

    function resetTheme() {
        const root = document.documentElement;
        root.style.setProperty("--accent", "#a10000");
        root.style.setProperty("--accent2", "#ff1b1b");
        root.style.setProperty("--accent-2", "#ff1b1b");
        root.style.setProperty("--panel", "rgba(12, 6, 6, 0.94)");
        root.style.setProperty("--panel-2", "rgba(18, 9, 9, 0.92)");
        root.style.setProperty("--text", "#eeeeee");
        root.style.setProperty("--muted", "#8c8c8c");
        root.style.setProperty("--border", "rgba(255, 0, 0, 0.45)");
        root.style.setProperty("--nixie", "#ff4400");
    }

    return {
        applyTheme,
        resetTheme,
    };
})();