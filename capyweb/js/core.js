// 1. AJAN VERİTABANI (Dosya bağımsızlığı için burada durması en güvenlisi)
const AgentConfigs = {
    'Makise_Kurisu': {
        displayName: 'MAKISE KURISU',
        themeAccent: '#a10000',
        themePanel: 'rgba(15, 5, 5, 0.95)',
        themeGlow: 'rgba(161, 0, 0, 0.3)',
        userTxt: '#ffffff',
        voiceSupported: true
    },
    'Winter_Agent': {
        displayName: 'WINTER AGENT',
        themeAccent: '#90e0ef',
        themePanel: 'rgba(8, 14, 22, 0.95)',
        themeGlow: 'rgba(144, 224, 239, 0.2)',
        userTxt: '#02182b',
        voiceSupported: false
    }
};

let currentAgent = "", voiceEnabled = false, isConnecting = false, mediaRecorder = null, chunks = [], micStream = null;
let audioContext, analyzer, dataArray, pastedImageB64 = null;

// Elementleri fonksiyon içinde yakalayacağız ki "undefined" hatası vermesin
const getEl = (id) => document.getElementById(id);

// --- AJAN BAŞLATMA (SEÇİM EKRANI FIX) ---
async function initAgent(agentKey) {
    console.log("Agent başlatılıyor:", agentKey); // Konsoldan kontrol edebilirsin
    currentAgent = agentKey;
    const cfg = AgentConfigs[agentKey];
    if (!cfg) return;

    const baseUrl = `http://127.0.0.1:5000/uigrounds/${agentKey}`;
    
    // Temayı Uygula
    document.documentElement.style.setProperty('--accent', cfg.themeAccent);
    document.documentElement.style.setProperty('--panel', cfg.themePanel);
    document.documentElement.style.setProperty('--glow', cfg.themeGlow);
    document.documentElement.style.setProperty('--user-txt', cfg.userTxt);

    // Görselleri Yükle
    getEl('active-profile').src = `${baseUrl}/profile.jpg`;
    document.body.style.backgroundImage = `url('${baseUrl}/background.jpg')`;
    getEl('agent-display-name').textContent = cfg.displayName;
    
    // EKRANLARI DEĞİŞTİR (ASIL NOKTA BURASI)
    getEl('selector-screen').style.display = 'none';
    getEl('draggable').style.display = 'flex';
    
    // Zoom sıfırla ve ortala
    getEl('active-profile').classList.remove('zoomed');
    const winW = window.innerWidth, winH = window.innerHeight;
    getEl('draggable').style.left = (winW / 2 - 250) + "px";
    getEl('draggable').style.top = (winH / 2 - 350) + "px";

    if (!cfg.voiceSupported) {
        getEl('voice-btn').classList.add('disabled-btn');
        getEl('voice-btn').textContent = "SES: BLOKE";
    } else {
        getEl('voice-btn').classList.remove('disabled-btn');
        getEl('voice-btn').textContent = "VOICE ENGINE: OFF";
    }

    new Audio('http://127.0.0.1:5000/sounds/systemopen.wav').play().catch(e => {});
    loadHistory();
}

// --- SES VE NABIZ SİSTEMİ ---
function setupAudioVisualizer(audioElement) {
    if(!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyzer = audioContext.createAnalyser(); analyzer.fftSize = 256;
        dataArray = new Uint8Array(analyzer.frequencyBinCount);
    }
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyzer); analyzer.connect(audioContext.destination);
    
    function renderFrame() {
        if(audioElement.paused || audioElement.ended) {
            getEl('active-profile').style.transform = `scale(1)`;
            getEl('active-profile').classList.remove('speaking'); return;
        }
        requestAnimationFrame(renderFrame);
        analyzer.getByteFrequencyData(dataArray);
        let vol = dataArray.reduce((a, b) => a + b) / dataArray.length; 
        getEl('active-profile').style.transform = `scale(${1 + (vol / 450)})`;
        getEl('active-profile').style.boxShadow = `0 0 ${vol}px var(--accent)`;
    }
    getEl('active-profile').classList.add('speaking'); renderFrame();
}

// --- MESAJLAŞMA ---
async function talk(txt = null) {
    const v = txt || getEl('inp').value.trim();
    if(!v && !pastedImageB64) return;
    if(!txt) getEl('inp').value = '';
    
    appendMsg({role:'user', content: v + (pastedImageB64 ? " [Görsel]" : ""), timestamp: new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}, true);
    
    let payload = {message:v, agent:currentAgent, voice_enabled: voiceEnabled, image_b64: pastedImageB64};
    pastedImageB64 = null; getEl('paste-preview-container').style.display = 'none';

    const res = await fetch('http://127.0.0.1:5000/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await res.json(); appendMsg(d.history[d.history.length-1], false, d.audio_url, d.emotion);
}

function appendMsg(msg, isH, audioUrl, emotion = null) {
    const b = document.createElement('div'); b.className = `msg-box ${msg.role==='user'?'user-box':'ai-box'}`;
    const c = document.createElement('div'); c.className = `msg ${msg.role==='user'?'user-msg':'ai-msg'}`;
    
    if (msg.role === 'assistant' && !isH) {
        if(emotion) {
            getEl('emotion-panel-bg').src = `http://127.0.0.1:5000/uigrounds/${currentAgent}/${emotion}.jpg`;
            getEl('emotion-panel-bg').classList.add('emotion-fade-anim');
            setTimeout(() => getEl('emotion-panel-bg').classList.remove('emotion-fade-anim'), 15000);
        }
        typeWriter(c, msg.content, audioUrl);
    } else { c.textContent = msg.content; }
    
    b.appendChild(c); getEl('box').appendChild(b); getEl('box').scrollTop = getEl('box').scrollHeight;
}

function typeWriter(element, text, audioUrl, i = 0) {
    if (i === 0 && audioUrl && voiceEnabled && AgentConfigs[currentAgent].voiceSupported) { 
        let audio = new Audio(audioUrl); audio.crossOrigin = "anonymous";
        audio.play().then(() => setupAudioVisualizer(audio)).catch(() => {}); 
    }
    if (i < text.length) {
        element.textContent += text.charAt(i); getEl('box').scrollTop = getEl('box').scrollHeight;
        setTimeout(() => typeWriter(element, text, audioUrl, i + 1), 20);
    }
}

// --- SÜRÜKLEME VE ZOOM ---
getEl('active-profile').onclick = () => getEl('active-profile').classList.toggle('zoomed');

let isD = false, sX, sY, iL, iT;
getEl('drag-handle').onmousedown = (e) => {
    if(getEl('active-profile').classList.contains('zoomed')) return;
    isD = true; const r = getEl('draggable').getBoundingClientRect();
    iL = r.left; iT = r.top; sX = e.clientX; sY = e.clientY;
};
document.onmousemove = (e) => { if (isD) { getEl('draggable').style.left = (iL + (e.clientX - sX)) + "px"; getEl('draggable').style.top = (iT + (e.clientY - sY)) + "px"; } };
document.onmouseup = () => isD = false;

// --- DİĞER API FONKSİYONLARI ---
async function toggleVoice() {
    if (isConnecting) return;
    if (!voiceEnabled) {
        isConnecting = true; getEl('voice-btn').textContent = 'BOOTING...'; getEl('blocker-msg').style.display = 'block';
        const res = await fetch('http://127.0.0.1:5000/api/gvc/start', {method:'POST'});
        if (res.ok) { voiceEnabled = true; getEl('voice-btn').classList.add('on'); getEl('voice-btn').textContent = 'SES MOTORU: AÇIK'; }
        isConnecting = false; getEl('blocker-msg').style.display = 'none';
    } else { voiceEnabled = false; getEl('voice-btn').classList.remove('on'); getEl('voice-btn').textContent = 'SES MOTORU: KAPALI'; }
}

async function killGVC() { await fetch('http://127.0.0.1:5000/api/gvc/kill', {method:'POST'}); voiceEnabled = false; getEl('voice-btn').classList.remove('on'); getEl('voice-btn').textContent = 'SES MOTORU: KAPALI'; }

async function loadHistory() { const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${currentAgent}`); const d = await res.json(); if(d.history) { getEl('box').innerHTML = ''; d.history.forEach(m => appendMsg(m, true)); } }

// Saat
setInterval(() => { const now = new Date(); getEl('nixie-clock').textContent = now.toLocaleTimeString('tr-TR') + " - " + now.toLocaleDateString('tr-TR'); }, 1000);

// Input ve Paste
getEl('send').onclick = () => talk();
getEl('inp').onkeypress = e => { if(e.key==='Enter') talk(); };
getEl('inp').addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            let reader = new FileReader();
            reader.onload = (ev) => { pastedImageB64 = ev.target.result; getEl('paste-preview-img').src = pastedImageB64; getEl('paste-preview-container').style.display = 'block'; };
            reader.readAsDataURL(items[i].getAsFile());
        }
    }
});
function removePastedImage() { pastedImageB64 = null; getEl('paste-preview-container').style.display = 'none'; }
// AJAN BAŞLATMA (Hatasız)
async function initAgent(agentKey) {
    currentAgent = agentKey; const cfg = AgentConfigs[agentKey];
    const baseUrl = `http://127.0.0.1:5000/uigrounds/${agentKey}`;
    
    document.documentElement.style.setProperty('--accent', cfg.themeAccent);
    document.documentElement.style.setProperty('--panel', cfg.themePanel);
    document.documentElement.style.setProperty('--glow', cfg.themeGlow);
    document.documentElement.style.setProperty('--user-txt', cfg.userTxt);

    elements.profile.src = `${baseUrl}/profile.jpg`;
    document.body.style.backgroundImage = `url('${baseUrl}/background.jpg')`;
    document.getElementById('agent-display-name').textContent = cfg.displayName;
    
    elements.selector.style.display = 'none';
    elements.chatContainer.style.display = 'flex';
    
    // Reset position to center on agent load (Zıplama Fix)
    const winW = window.innerWidth, winH = window.innerHeight;
    elements.chatContainer.style.left = (winW / 2 - 250) + "px";
    elements.chatContainer.style.top = (winH / 2 - 350) + "px";

    if (!cfg.voiceSupported) {
        elements.voiceBtn.classList.add('disabled-btn'); elements.voiceBtn.textContent = "SES: BLOKE";
    }
    loadHistory();
}

// Görsel Yapıştırma (Orijinal)
elements.inp.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            let reader = new FileReader();
            reader.onload = (ev) => { pastedImageB64 = ev.target.result; elements.previewImg.src = pastedImageB64; elements.preview.style.display = 'block'; };
            reader.readAsDataURL(items[i].getAsFile());
        }
    }
});
function removePastedImage() { pastedImageB64 = null; elements.preview.style.display = 'none'; }
document.getElementById('send').onclick = () => talk();
elements.inp.onkeypress = e => { if(e.key==='Enter') talk(); };