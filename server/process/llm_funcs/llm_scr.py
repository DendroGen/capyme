import yaml, json, os, sys, uuid, subprocess
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from faster_whisper import WhisperModel

# --- Klasör Ayarları ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)

# --- GSV2 Başlatıcı ---
GSV2_PATH = r"C:\SVG\GSv2pro"


def start_gsv2():
    print("--- [SİSTEM] Amadeus Voice Core Başlatılıyor ---")
    cmd = f'start cmd /k "cd /d {GSV2_PATH} && runtime\\python.exe api_v2.py -a 127.0.0.1 -p 9880"'
    os.system(cmd)


from process.tts_func.sovits_ping import sovits_gen

with open("character_config.yaml", "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

# Ollama Bağlantısı
client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL = cfg.get("model", "llama3")
# Whisper Modelini Başlat (Düzgün isimlendirme)
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)
AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)


def process_logic(user_text, edit_idx=None):
    hist = []
    if os.path.exists("chat_history.json"):
        with open("chat_history.json", "r", encoding="utf-8") as f:
            hist = json.load(f)
    else:
        hist = [
            {"role": "system", "content": cfg["presets"]["default"]["system_prompt"]}
        ]

    if edit_idx:
        hist = hist[: int(edit_idx)]

    if user_text.strip():
        hist.append({"role": "user", "content": user_text})

    resp = client.chat.completions.create(model=MODEL, messages=hist)
    ai_msg = resp.choices[0].message.content
    hist.append({"role": "assistant", "content": ai_msg})

    with open("chat_history.json", "w", encoding="utf-8") as f:
        json.dump(hist, f, indent=2, ensure_ascii=False)

    return ai_msg, [m for m in hist if m["role"] != "system"]


@app.route("/api/history")
def history():
    # Boş mesaj göndermeden sadece geçmişi oku
    hist = []
    if os.path.exists("chat_history.json"):
        with open("chat_history.json", "r", encoding="utf-8") as f:
            hist = json.load(f)
    return jsonify({"history": [m for m in hist if m["role"] != "system"]})


@app.route("/api/chat", methods=["POST"])
def chat():
    d = request.json
    reply, hist = process_logic(d.get("message"), d.get("edit_index"))
    return jsonify({"reply": reply, "history": hist})


@app.route("/api/voice_chat", methods=["POST"])
def voice_chat():
    try:
        audio_file = request.files["audio"]
        temp_path = os.path.join(AUDIO_DIR, f"in_{uuid.uuid4().hex}.webm")
        audio_file.save(temp_path)

        segments, _ = whisper_engine.transcribe(temp_path)
        user_text = "".join([s.text for s in segments]).strip()
        os.remove(temp_path)

        if not user_text:
            return jsonify({"error": "Sessizlik algılandı"}), 400

        ai_reply, history_data = process_logic(
            user_text, request.form.get("edit_index")
        )

        out_name = f"res_{uuid.uuid4().hex}.wav"
        out_path = os.path.join(AUDIO_DIR, out_name)

        # TTS Üretimi
        success = sovits_gen(ai_reply, out_path)
        audio_url = f"http://127.0.0.1:5000/audio/{out_name}" if success else None

        return jsonify(
            {
                "user_text": user_text,
                "reply": ai_reply,
                "history": history_data,
                "audio_url": audio_url,
            }
        )
    except Exception as e:
        print(f"--- [SERVER ERROR] {e} ---")
        return jsonify({"error": str(e)}), 500


@app.route("/audio/<f>")
def serve(f):
    return send_from_directory(AUDIO_DIR, f)


@app.route("/api/gsv2/toggle", methods=["POST"])
def toggle():
    # Basit bir tetikleme (GSV2 zaten başlangıçta açılıyor)
    return jsonify({"status": "open"})


if __name__ == "__main__":
    start_gsv2()
    app.run(port=5000)
