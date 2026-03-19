// 1. AJAN VERİTABANI
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

// 2. ÇEKİRDEK İŞLEMLER
let currentAgent = "", voiceEnabled = false, isConnecting = false, mediaRecorder = null, chunks = [], micStream = null;
let clockInterval, pastedImageB64 = null;
const box = document.getElementById('box'), inp = document.getElementById('inp'), voiceBtn = document.getElementById('voice-btn');
const blocker = document.getElementById('blocker-msg'), micBtn = document.getElementById('mic'), sendBtn = document.getElementById('send');
const emotionBg = document.getElementById('emotion-panel-bg'), nixie = document.getElementById('nixie-clock');
const previewContainer = document.getElementById('paste-preview-container'), previewImg = document.getElementById('paste-preview-img');

let audioContext, analyzer, dataArray;
function setupAudioVisualizer(audioElement) {
    if(!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 256;
        dataArray = new Uint8Array(analyzer.frequencyBinCount);
    }
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyzer);
    analyzer.connect(audioContext.destination);
    
    function renderFrame() {
        if(audioElement.paused || audioElement.ended) {
            document.getElementById('active-profile').style.transform = `scale(1)`;
            return;
        }
        requestAnimationFrame(renderFrame);
        analyzer.getByteFrequencyData(dataArray);
        let volume = dataArray.reduce((a, b) => a + b) / dataArray.length; 
        let scale = 1 + (volume / 1000); 
        document.getElementById('active-profile').style.transform = `scale(${scale})`;
        document.getElementById('active-profile').style.boxShadow = `0 0 ${volume/2}px var(--accent)`;
    }
    renderFrame();
}

inp.addEventListener('paste', function(e) {
    let items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            let blob = items[i].getAsFile();
            let reader = new FileReader();
            reader.onload = function(event) {
                pastedImageB64 = event.target.result;
                previewImg.src = pastedImageB64;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(blob);
        }
    }
});

function removePastedImage() { pastedImageB64 = null; previewContainer.style.display = 'none'; previewImg.src = ''; }

function updateClock() {
    const now = new Date();
    nixie.textContent = now.toLocaleTimeString('tr-TR') + " - " + now.toLocaleDateString('tr-TR', {day:'2-digit', month:'2-digit', year:'numeric'});
}
clockInterval = setInterval(updateClock, 1000); updateClock();

async function initAgent(agentKey) {
    currentAgent = agentKey; const cfg = AgentConfigs[agentKey]; const baseUrl = `http://127.0.0.1:5000/uigrounds/${agentKey}`;
    document.documentElement.style.setProperty('--accent', cfg.themeAccent); document.documentElement.style.setProperty('--panel', cfg.themePanel);
    document.documentElement.style.setProperty('--glow', cfg.themeGlow); document.documentElement.style.setProperty('--user-txt', cfg.userTxt);

    if (!cfg.voiceSupported) {
        voiceBtn.classList.add('disabled-btn'); voiceBtn.textContent = "SES: BLOKE"; micBtn.classList.add('disabled-btn');
        document.getElementById('kill-btn').style.display = 'none';
    } else {
        voiceBtn.classList.remove('disabled-btn'); voiceBtn.textContent = "SES MOTORU: KAPALI"; micBtn.classList.remove('disabled-btn');
        document.getElementById('kill-btn').style.display = 'block';
    }

    document.body.style.backgroundImage = `url('${baseUrl}/background.jpg')`; 
    document.getElementById('active-profile').src = `${baseUrl}/profile.jpg`;
    document.getElementById('agent-display-name').textContent = cfg.displayName;
    document.getElementById('selector-screen').style.display = 'none'; document.getElementById('draggable').style.display = 'flex';
    loadHistory().catch(e => {});
}

async function initMic() { try { if (!micStream) { micStream = await navigator.mediaDevices.getUserMedia({audio:true}); } return true; } catch (e) { alert("Mikrofon izni reddedildi."); return false; } }

function triggerEmotion(emotion) {
    if (!emotion) return; const baseUrl = `http://127.0.0.1:5000/uigrounds/${currentAgent}`;
    emotionBg.src = `${baseUrl}/${emotion}.jpg`; emotionBg.classList.remove('emotion-fade-anim'); void emotionBg.offsetWidth; emotionBg.classList.add('emotion-fade-anim');
}

function typeWriter(element, text, audioUrl, i = 0) {
    if (i === 0 && audioUrl && voiceEnabled && AgentConfigs[currentAgent].voiceSupported) { 
        let audio = new Audio(audioUrl);
        audio.crossOrigin = "anonymous";
        audio.play().then(() => { setupAudioVisualizer(audio); }).catch(e => {}); 
    }
    if (i < text.length) {
        element.textContent += text.charAt(i); box.scrollTop = box.scrollHeight;
        setTimeout(() => typeWriter(element, text, audioUrl, i + 1), 20);
    }
}

function appendMsg(msg, isHistory, audioUrl, emotion = null) {
    const bDiv = document.createElement('div'); bDiv.className = `msg-box ${msg.role==='user'?'user-box':'ai-box'}`;
    const cDiv = document.createElement('div'); cDiv.className = `msg ${msg.role==='user'?'user-msg':'ai-msg'}`;
    const tDiv = document.createElement('div'); tDiv.className = 'ts'; tDiv.textContent = msg.timestamp || "";
    if (msg.role === 'assistant' && !isHistory) {
        triggerEmotion(emotion); typeWriter(cDiv, msg.content, audioUrl);
    } else { cDiv.textContent = msg.content; }
    bDiv.appendChild(cDiv); bDiv.appendChild(tDiv); box.appendChild(bDiv); box.scrollTop = box.scrollHeight;
}

async function talk(txt = null) {
    const v = txt || inp.value.trim(); 
    if(!v && !pastedImageB64) return; 
    if(!txt) inp.value = '';
    
    let displayTxt = v;
    if(pastedImageB64) displayTxt += " [Görsel Eklendi]";
    appendMsg({role:'user', content:displayTxt, timestamp: new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}, true);
    
    let payloadData = {message:v, agent:currentAgent, voice_enabled: voiceEnabled};
    if(pastedImageB64) { payloadData.image_b64 = pastedImageB64; removePastedImage(); }

    const res = await fetch('http://127.0.0.1:5000/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payloadData)});
    const d = await res.json(); appendMsg(d.history[d.history.length-1], false, d.audio_url, d.emotion);
}

micBtn.onclick = async () => {
    if (!AgentConfigs[currentAgent].voiceSupported) return; 
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        const micGranted = await initMic(); if (!micGranted) return;
        mediaRecorder = new MediaRecorder(micStream); mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const fd = new FormData(); fd.append('audio', new Blob(chunks, {type:'audio/webm'})); fd.append('agent', currentAgent); fd.append('voice_enabled', voiceEnabled); chunks = [];
            const res = await fetch('http://127.0.0.1:5000/api/voice_chat', {method:'POST', body:fd}); const d = await res.json();
            if (d.user_text) appendMsg({role:'user', content:d.user_text}, true); if (d.reply) appendMsg(d.history[d.history.length-1], false, d.audio_url, d.emotion);
        };
        mediaRecorder.start(); micBtn.style.background = '#ff3333';
    } else { mediaRecorder.stop(); micBtn.style.background = ''; }
};

async function loadHistory() {
    const res = await fetch(`http://127.0.0.1:5000/api/history?agent=${currentAgent}`);
    const d = await res.json(); if(d.history) { box.innerHTML = ''; d.history.forEach(m => appendMsg(m, true)); }
}

async function toggleVoice() {
    if (!AgentConfigs[currentAgent].voiceSupported || isConnecting) return;
    if (!voiceEnabled) {
        isConnecting = true; voiceBtn.textContent = 'BAŞLATILIYOR...'; inp.disabled = true; blocker.style.display = 'block';
        const res = await fetch('http://127.0.0.1:5000/api/gvc/start', {method:'POST'});
        if (res.ok) { voiceEnabled = true; voiceBtn.className = 'v-btn on'; voiceBtn.textContent = 'SES MOTORU: AÇIK'; }
        isConnecting = false; inp.disabled = false; blocker.style.display = 'none';
    } else { voiceEnabled = false; voiceBtn.className = 'v-btn'; voiceBtn.textContent = 'SES MOTORU: KAPALI'; }
}

async function killGVC() { await fetch('http://127.0.0.1:5000/api/gvc/kill', {method:'POST'}); voiceEnabled = false; voiceBtn.className = 'v-btn'; voiceBtn.textContent = 'SES MOTORU: KAPALI'; alert("Motor Durduruldu."); }

async function worldlineShift() {
    document.body.classList.add('glitch-anim');
    clearInterval(clockInterval);
    let scrambleCount = 0;
    const scrambleInt = setInterval(() => {
        nixie.textContent = Math.random().toString(36).substring(2, 10).toUpperCase();
        nixie.style.color = "#fff";
        scrambleCount++;
        if(scrambleCount > 20) { 
            clearInterval(scrambleInt); 
            nixie.style.color = "var(--nixie)"; 
            clockInterval = setInterval(updateClock, 1000); 
            updateClock();
        }
    }, 50);

    box.innerHTML = `<div class="wipe-msg">[ DÜNYA ÇİZGİSİ KAYDI. ${currentAgent.toUpperCase()} HAFIZASI SİLİNDİ. ]</div>`;
    
    await fetch(`http://127.0.0.1:5000/api/clear_history?agent=${currentAgent}`, {method:'POST'});
    setTimeout(() => { document.body.classList.remove('glitch-anim'); }, 1000);
}

const dItem = document.getElementById('draggable'), dHandle = document.getElementById('drag-handle'); let isD = false, sX, sY, iL, iT;
dHandle.onmousedown = (e) => { isD = true; const r = dItem.getBoundingClientRect(); iL = r.left; iT = r.top; sX = e.clientX; sY = e.clientY; dItem.style.transform = 'none'; dItem.style.left = iL + 'px'; dItem.style.top = iT + 'px'; };
document.onmousemove = (e) => { if (!isD) return; let nL = iL + (e.clientX - sX), nT = iT + (e.clientY - sY); dItem.style.left = nL + 'px'; dItem.style.top = nT + 'px'; };
document.onmouseup = () => isD = false;
sendBtn.onclick = () => talk(); inp.onkeypress = e => { if(e.key==='Enter') talk(); };