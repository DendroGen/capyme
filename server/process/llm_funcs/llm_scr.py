import yaml, json, os, sys, uuid, datetime, socket, time, re, subprocess, unicodedata
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from faster_whisper import WhisperModel
import pytz

# --- 1. YOL AYARLARI ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)

from process.tts_func.sovits_ping import sovits_gen


# --- TEMİZLİK FONKSİYONLARI ---
def ultra_clean_text(text):
    if not text:
        return ""
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] not in ["S", "C"])
    text = re.sub(r"[^a-zA-Z0-9\s\.\!\?\,\:\'\"\-\(\)\*\u00C0-\u017F]", "", text)
    return text.strip()


def clean_for_voice(text):
    if not text:
        return ""
    text = re.sub(r"\*.*?\*", " ", text, flags=re.DOTALL)
    text = text.replace("*", "")
    text = re.sub(r"\.{2,}", ".", text)
    text = re.sub(r"[!?]+", "!", text)
    text = re.sub(r"[,;:]+", ",", text)
    text = re.sub(r"[^\w\s\.\,\!\?\'çğıöşüÇĞIÖŞÜ]", " ", text)
    text = re.sub(r"(.)\1{2,}", r"\1", text)
    text = re.sub(r"\s+", " ", text)
    return text.lower().strip()


with open("character_config.yaml", "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL_NAME = cfg.get("model", "dolphin-mistral")
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)
AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
UIGROUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/uigrounds"))
SOUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/sounds"))
os.makedirs(AUDIO_DIR, exist_ok=True)

GSV2_PATH = r"C:\SVG\GSv2pro"


def detect_emotion(text):
    text = text.lower()
    if any(
        word in text
        for word in ["baka", "shut up", "stupid", "christina", "assistant", "stop it"]
    ):
        return "angry_shout"
    if any(
        word in text
        for word in [
            "don't look",
            "pervert",
            "embarrassing",
            "blush",
            "hentai",
            "cute",
            "tatli",
            "sevimli",
            "tatlı",
        ]
    ):
        return "shy_overheat"
    if any(
        word in text
        for word in [
            "hm",
            "interesting",
            "theory",
            "calculate",
            "thinking",
            "science",
            "bilim",
        ]
    ):
        return "thinking"
    if any(
        word in text for word in ["sorry", "sad", "fail", "tear", "regret", "üzgün"]
    ):
        return "sad"
    if any(word in text for word in ["logical", "cold", "pointless", "nonsense"]):
        return "angry_cold"
    if any(word in text for word in ["well...", "maybe", "i guess"]):
        return "shy_hiding"
    return "shy_mild"


# --- DİNAMİK AJAN BEYNİ (YENİ ÖZELLİK) ---
def get_logic(agent, txt):
    f = f"{agent}.json"

    # 1. Hafızayı Oku veya Yarat
    if os.path.exists(f):
        with open(f, "r", encoding="utf-8") as file:
            h = json.load(file)
    else:
        # 2. Ajanın kendi prompt txt dosyası var mı kontrol et
        prompt_file = os.path.join(SERVER_DIR, f"{agent}_prompt.txt")
        if os.path.exists(prompt_file):
            with open(prompt_file, "r", encoding="utf-8") as pf:
                system_prompt = pf.read().strip()
        else:
            # Yoksa Kurisu'nun varsayılan YAML promptunu kullan
            system_prompt = cfg["presets"]["default"]["system_prompt"]

        h = [{"role": "system", "content": system_prompt}]

    if txt:
        ts = datetime.datetime.now(pytz.timezone("Europe/Istanbul")).strftime(
            "%H:%M:%S"
        )
        h.append({"role": "user", "content": txt, "timestamp": ts})

    r = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[{"role": m["role"], "content": m["content"]} for m in h],
    )
    ai = r.choices[0].message.content
    h.append(
        {
            "role": "assistant",
            "content": ai,
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        }
    )

    with open(f, "w", encoding="utf-8") as file:
        json.dump(h, file, indent=2, ensure_ascii=False)
    return ai, [m for m in h if m["role"] != "system"]


@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        d = request.json
        reply, h = get_logic(d.get("agent", "Makise_Kurisu"), d.get("message"))

        reply = ultra_clean_text(reply)
        emotion = detect_emotion(reply)
        audio_url = None

        if d.get("voice_enabled") and is_port_open(9880):
            voice_text = clean_for_voice(reply)
            if voice_text.strip():
                msg_id = uuid.uuid4().hex
                final_n = f"res_{msg_id}.wav"
                p_p = os.path.join(AUDIO_DIR, final_n)
                if sovits_gen(" " + voice_text, p_p):
                    audio_url = f"http://127.0.0.1:5000/audio/{final_n}"

        return jsonify(
            {"reply": reply, "history": h, "audio_url": audio_url, "emotion": emotion}
        )
    except Exception as e:
        print("Chat API Error:", e)
        return jsonify(
            {
                "reply": "*Sistemde ufak bir hata oluştu ama dinliyorum.*",
                "history": [],
                "audio_url": None,
                "emotion": "sad",
            }
        )


@app.route("/api/voice_chat", methods=["POST"])
def voice_chat():
    try:
        agent = request.form.get("agent")
        voice_enabled = request.form.get("voice_enabled") == "true"
        audio_f = request.files["audio"]
        tmp = os.path.join(AUDIO_DIR, f"v_{uuid.uuid4().hex}.webm")
        audio_f.save(tmp)

        segments, _ = whisper_engine.transcribe(tmp)
        ut = "".join([s.text for s in segments]).strip()

        try:
            os.remove(tmp)
        except:
            pass

        if not ut:
            return jsonify({"error": "No audio"}), 400

        reply, h = get_logic(agent, ut)
        reply = ultra_clean_text(reply)
        emotion = detect_emotion(reply)
        audio_url = None

        if voice_enabled and is_port_open(9880):
            voice_text = clean_for_voice(reply)
            if voice_text.strip():
                msg_id = uuid.uuid4().hex
                final_n = f"vres_{msg_id}.wav"
                p_p = os.path.join(AUDIO_DIR, final_n)
                if sovits_gen(" " + voice_text, p_p):
                    audio_url = f"http://127.0.0.1:5000/audio/{final_n}"

        return jsonify(
            {
                "user_text": ut,
                "reply": reply,
                "history": h,
                "audio_url": audio_url,
                "emotion": emotion,
            }
        )
    except Exception as e:
        print("Voice Chat API Error:", e)
        return jsonify(
            {
                "user_text": "...",
                "reply": "*Sistemde ufak bir hata oluştu.*",
                "history": [],
                "audio_url": None,
                "emotion": "sad",
            }
        )


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@app.route("/audio/<f>")
def serve_audio(f):
    return send_from_directory(AUDIO_DIR, f)


@app.route("/uigrounds/<path:filename>")
def serve_ui(filename):
    return send_from_directory(UIGROUNDS_DIR, filename)


@app.route("/sounds/<path:filename>")
def serve_sounds(filename):
    return send_from_directory(SOUNDS_DIR, filename)


@app.route("/api/history")
def history():
    agent = request.args.get("agent", "Makise_Kurisu")
    if os.path.exists(f"{agent}.json"):
        with open(f"{agent}.json", "r", encoding="utf-8") as f:
            return jsonify(
                {"history": [m for m in json.load(f) if m["role"] != "system"]}
            )
    return jsonify({"history": []})


@app.route("/api/gvc/start", methods=["POST"])
def start_gvc():
    if not is_port_open(9880):
        os.system(
            f'start "AMADEUS_GVC" /min cmd /c "cd /d {GSV2_PATH} && runtime\\python.exe api_v2.py -a 127.0.0.1 -p 9880"'
        )
        return jsonify({"status": "ready"})
    return jsonify({"status": "running"})


@app.route("/api/gvc/kill", methods=["POST"])
def kill_gvc():
    subprocess.call(
        ["taskkill", "/F", "/T", "/FI", "WINDOWTITLE eq AMADEUS_GVC*"], shell=True
    )
    return jsonify({"status": "terminated"})


if __name__ == "__main__":
    app.run(port=5000)
