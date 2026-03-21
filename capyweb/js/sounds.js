window.Sounds = (() => {
    let bootAudio = null;
    let clickAudio = null;

    let state = {
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
    };

    function setState(newState = {}) {
        state = {
            boot: { ...state.boot, ...(newState.boot || {}) },
            click: { ...state.click, ...(newState.click || {}) }
        };
    }

    function getState() {
        return structuredClone(state);
    }

    function buildAudio(url, volume) {
        if (!url) return null;
        const audio = new Audio(url);
        audio.volume = Number(volume ?? 1);
        return audio;
    }

    function refreshAudioObjects() {
        bootAudio = buildAudio(state.boot.url, state.boot.volume);
        clickAudio = buildAudio(state.click.url, state.click.volume);
    }

    function playBoot() {
        if (!state.boot.enabled || !bootAudio) return;
        bootAudio.currentTime = 0;
        bootAudio.volume = Number(state.boot.volume || 0.65);
        bootAudio.play().catch(() => {});
    }

    function playClick() {
        if (!state.click.enabled || !clickAudio) return;
        clickAudio.currentTime = 0;
        clickAudio.volume = Number(state.click.volume || 0.35);
        clickAudio.play().catch(() => {});
    }

    function bindGlobalClickSound() {
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (
                target instanceof HTMLElement &&
                (target.tagName === "BUTTON" || target.closest("button"))
            ) {
                playClick();
            }
        });
    }

    refreshAudioObjects();
    bindGlobalClickSound();

    return {
        setState,
        getState,
        refreshAudioObjects,
        playBoot,
        playClick
    };
})();