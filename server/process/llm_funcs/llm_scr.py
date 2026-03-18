import yaml, json, os, sys, uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from faster_whisper import WhisperModel

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)

from process.tts_func.sovits_ping import sovits_gen

with open("character_config.yaml", "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL_NAME = cfg.get("model", "llama3")
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)
AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
# UIGROUNDS klasörünü dışarıya açıyoruz
UIGROUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/uigrounds"))

os.makedirs(AUDIO_DIR, exist_ok=True)


def get_logic(txt, edit_idx=None):
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
    if txt:
        hist.append({"role": "user", "content": txt})
    resp = client.chat.completions.create(model=MODEL_NAME, messages=hist)
    ai_msg = resp.choices[0].message.content
    hist.append({"role": "assistant", "content": ai_msg})
    with open("chat_history.json", "w", encoding="utf-8") as f:
        json.dump(hist, f, indent=2, ensure_ascii=False)
    return ai_msg, [m for m in hist if m["role"] != "system"]


@app.route("/api/history")
def history():
    return jsonify({"history": get_logic("", None)[1]})


@app.route("/api/chat", methods=["POST"])
def chat():
    d = request.json
    reply, h = get_logic(d.get("message"), d.get("edit_index"))
    return jsonify({"reply": reply, "history": h})


@app.route("/api/voice_chat", methods=["POST"])
def voice():
    audio = request.files["audio"]
    tmp = os.path.join(AUDIO_DIR, f"v_{uuid.uuid4().hex}.webm")
    audio.save(tmp)
    seg, _ = whisper_engine.transcribe(tmp)
    user_txt = "".join([s.text for s in seg]).strip()
    os.remove(tmp)
    if not user_txt:
        return jsonify({"error": "Silence"}), 400
    reply, h = get_logic(user_txt, request.form.get("edit_index"))
    out_n = f"res_{uuid.uuid4().hex}.wav"
    out_p = os.path.join(AUDIO_DIR, out_n)
    sovits_gen(reply, out_p)
    return jsonify(
        {
            "user_text": user_txt,
            "reply": reply,
            "history": h,
            "audio_url": f"http://127.0.0.1:5000/audio/{out_n}",
        }
    )


@app.route("/audio/<f>")
def serve(f):
    return send_from_directory(AUDIO_DIR, f)


# Ajan dosyalarını çekmek için route
@app.route("/uigrounds/<path:filename>")
def serve_ui(filename):
    return send_from_directory(UIGROUNDS_DIR, filename)


if __name__ == "__main__":
    app.run(port=5000)
