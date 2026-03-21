window.GlobalSettings = (() => {
    const openBtn = document.getElementById("open-global-settings-btn");
    const closeBtn = document.getElementById("close-global-settings-btn");
    const saveBtn = document.getElementById("save-global-settings-btn");
    const resetBtn = document.getElementById("reset-global-settings-btn");

    const accentInput = document.getElementById("main-accent-color");
    const accent2Input = document.getElementById("main-accent2-color");
    const textInput = document.getElementById("main-text-color");
    const panelInput = document.getElementById("main-panel-color");

    const bootFileInput = document.getElementById("boot-sound-file");
    const bootVolumeInput = document.getElementById("boot-sound-volume");
    const clickFileInput = document.getElementById("click-sound-file");
    const clickVolumeInput = document.getElementById("click-sound-volume");

    const bootToggle = document.getElementById("play-boot-sound-toggle");
    const clickToggle = document.getElementById("play-click-sound-toggle");

    const DEFAULTS = {
        ui: {
            accent: "#a10000",
            accent2: "#ff1b1b",
            text: "#eeeeee",
            panel: "#0c0606"
        },
        audio: {
            boot: {
                enabled: true,
                url: "",
                volume: 0.65
            },
            click: {
                enabled: true,
                url: "",
                volume: 0.35
            }
        }
    };

    let currentState = structuredClone(DEFAULTS);

    function fillForm(state) {
        accentInput.value = state.ui.accent;
        accent2Input.value = state.ui.accent2;
        textInput.value = state.ui.text;
        panelInput.value = state.ui.panel;

        bootVolumeInput.value = state.audio.boot.volume;
        clickVolumeInput.value = state.audio.click.volume;
        bootToggle.checked = Boolean(state.audio.boot.enabled);
        clickToggle.checked = Boolean(state.audio.click.enabled);
    }

    function collectState() {
        return {
            ui: {
                accent: accentInput.value,
                accent2: accent2Input.value,
                text: textInput.value,
                panel: panelInput.value
            },
            audio: {
                boot: {
                    enabled: bootToggle.checked,
                    url: currentState.audio.boot.url || "",
                    volume: Number(bootVolumeInput.value || 0.65)
                },
                click: {
                    enabled: clickToggle.checked,
                    url: currentState.audio.click.url || "",
                    volume: Number(clickVolumeInput.value || 0.35)
                }
            }
        };
    }

    function previewTheme() {
        window.Theme.applyTheme({
            accent: accentInput.value,
            accent2: accent2Input.value,
            text: textInput.value,
            panel: panelInput.value
        });
    }

    async function loadSettings() {
        try {
            const res = await fetch("http://127.0.0.1:5000/api/settings");
            const data = await res.json();

            if (!res.ok) return;

            currentState = {
                ui: { ...DEFAULTS.ui, ...(data.ui || {}) },
                audio: {
                    boot: { ...DEFAULTS.audio.boot, ...(data.audio?.boot || {}) },
                    click: { ...DEFAULTS.audio.click, ...(data.audio?.click || {}) }
                }
            };

            fillForm(currentState);
            window.Theme.applyTheme(currentState.ui);
            window.Sounds.setState(currentState.audio);
            window.Sounds.refreshAudioObjects();
        } catch (e) {
            console.error("Settings load error:", e);
            fillForm(DEFAULTS);
        }
    }

    async function saveSettings() {
        try {
            const state = collectState();
            const fd = new FormData();
            fd.append("ui", JSON.stringify(state.ui));
            fd.append("audio", JSON.stringify(state.audio));

            const bootFile = bootFileInput.files?.[0];
            const clickFile = clickFileInput.files?.[0];

            if (bootFile) fd.append("boot_file", bootFile);
            if (clickFile) fd.append("click_file", clickFile);

            const res = await fetch("http://127.0.0.1:5000/api/settings/save", {
                method: "POST",
                body: fd
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Settings save failed.");
                return;
            }

            currentState = {
                ui: { ...DEFAULTS.ui, ...(data.settings?.ui || state.ui) },
                audio: {
                    boot: { ...DEFAULTS.audio.boot, ...(data.settings?.audio?.boot || state.audio.boot) },
                    click: { ...DEFAULTS.audio.click, ...(data.settings?.audio?.click || state.audio.click) }
                }
            };

            fillForm(currentState);
            window.Theme.applyTheme(currentState.ui);
            window.Sounds.setState(currentState.audio);
            window.Sounds.refreshAudioObjects();
            window.UIState.hideGlobalSettingsModal();
        } catch (e) {
            console.error("Settings save error:", e);
            alert("Settings save failed.");
        }
    }

    async function resetSettings() {
        const ok = confirm("Sadece ana ekran / global ayarlar default'a dönsün mü? Ajan ayarları etkilenmez.");
        if (!ok) return;

        try {
            const res = await fetch("http://127.0.0.1:5000/api/settings/reset", {
                method: "POST"
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Reset failed.");
                return;
            }

            currentState = {
                ui: { ...DEFAULTS.ui, ...(data.settings?.ui || DEFAULTS.ui) },
                audio: {
                    boot: { ...DEFAULTS.audio.boot, ...(data.settings?.audio?.boot || DEFAULTS.audio.boot) },
                    click: { ...DEFAULTS.audio.click, ...(data.settings?.audio?.click || DEFAULTS.audio.click) }
                }
            };

            fillForm(currentState);
            window.Theme.applyTheme(currentState.ui);
            window.Sounds.setState(currentState.audio);
            window.Sounds.refreshAudioObjects();
        } catch (e) {
            console.error("Reset settings error:", e);
            alert("Reset failed.");
        }
    }

    function bindEvents() {
        openBtn?.addEventListener("click", async () => {
            await loadSettings();
            window.UIState.showGlobalSettingsModal();
        });

        closeBtn?.addEventListener("click", () => {
            window.UIState.hideGlobalSettingsModal();
        });

        saveBtn?.addEventListener("click", saveSettings);
        resetBtn?.addEventListener("click", resetSettings);

        [accentInput, accent2Input, textInput, panelInput].forEach((el) => {
            el?.addEventListener("input", previewTheme);
        });
    }

    bindEvents();

    return {
        loadSettings
    };
})();