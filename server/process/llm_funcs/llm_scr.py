import yaml, json, os, sys, uuid, datetime, socket, time, re, subprocess, wave
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from faster_whisper import WhisperModel
import pytz

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
UIGROUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/uigrounds"))
os.makedirs(AUDIO_DIR, exist_ok=True)

GSV2_PATH = r"C:\SVG\GSv2pro"

PHONETIC_FIXES = {
    r"\byou're\b": "you are",
    r"\bi'm\b": "i am",
    r"\bit's\b": "it is",
    r"\bdon't\b": "do not",
    r"\bcan't\b": "cannot",
    r"\baren't\b": "are not",
    r"\bisn't\b": "is not",
    r"\bwon't\b": "will not",
    r"\bwhat's\b": "what is",
    r"\bwe're\b": "we are",
    r"\bthey're\b": "they are",
    r"\boutta\b": "out of",
}


def clean_for_speech_final(text):
    text = re.sub(r"\*.*?\*", "", text)  # Aksiyonları sil
    text = re.sub(r"(.)\1{2,}", r"\1", text)  # YESSSSS -> YES
    text = text.lower()
    for pattern, replacement in PHONETIC_FIXES.items():
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"[\"\'\(\)\[\]\-\_\\]", " ", text)
    text = (
        text.replace("?!", ".").replace("!?", ".").replace("!", ".").replace("?", ".")
    )
    text = re.sub(r"\.+", ".", text)
    text = re.sub(r"(?<=\b\w)\s(?=\w\b)", "", text)
    text = re.sub(r"[^a-z0-9\. ]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def merge_wavs(part_paths, output_path):
    if not part_paths:
        return False
    try:
        data = []
        for path in part_paths:
            if os.path.exists(path):
                w = wave.open(path, "rb")
                data.append([w.getparams(), w.readframes(w.getnframes())])
                w.close()
                os.remove(path)
        if not data:
            return False
        output = wave.open(output_path, "wb")
        output.setparams(data[0][0])
        for d in data:
            output.writeframes(d[1])
        output.close()
        return True
    except:
        return False


@app.route("/api/chat", methods=["POST"])
def chat():
    d = request.json
    reply, h = get_logic(d.get("agent", "Makise_Kurisu"), d.get("message"))
    audio_url = None

    if d.get("voice_enabled") and is_port_open(9880):
        cleaned = clean_for_speech_final(reply)
        raw_sentences = [s.strip() for s in re.split(r"(?<=[.])", cleaned) if s.strip()]

        # --- AKILLI BLOKLAMA (v3.4) ---
        # Kısa cümleleri birleştirerek motorun "teeee" demesini engelliyoruz.
        final_chunks = []
        current_chunk = ""
        for s in raw_sentences:
            if (
                len(current_chunk) + len(s) < 70
            ):  # 70 karakter motor için en güvenli alan
                current_chunk += " " + s
            else:
                if current_chunk:
                    final_chunks.append(current_chunk.strip())
                current_chunk = s
        if current_chunk:
            final_chunks.append(current_chunk.strip())

        if final_chunks:
            part_files = []
            msg_id = uuid.uuid4().hex
            for i, chunk in enumerate(final_chunks):
                # Başına sessizlik ekle, sonuna nokta koy
                safe_text = "  " + chunk
                if not safe_text.endswith("."):
                    safe_text += "."

                part_p = os.path.join(AUDIO_DIR, f"p_{msg_id}_{i}.wav")
                if sovits_gen(safe_text, part_p):
                    part_files.append(part_p)

            final_n = f"res_{msg_id}.wav"
            if merge_wavs(part_files, os.path.join(AUDIO_DIR, final_n)):
                audio_url = f"http://127.0.0.1:5000/audio/{final_n}"

    return jsonify({"reply": reply, "history": h, "audio_url": audio_url})


# --- DİĞER FONKSİYONLAR ---


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def get_logic(agent, txt):
    f = f"{agent}.json"
    if os.path.exists(f):
        with open(f, "r", encoding="utf-8") as file:
            h = json.load(file)
    else:
        h = [{"role": "system", "content": cfg["presets"]["default"]["system_prompt"]}]
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


@app.route("/api/gvc/start", methods=["POST"])
def start_gvc():
    if not is_port_open(9880):
        os.system(
            f'start "AMADEUS_GVC" /min cmd /c "cd /d {GSV2_PATH} && runtime\\python.exe api_v2.py -a 127.0.0.1 -p 9880"'
        )
        for _ in range(30):
            time.sleep(1)
            if is_port_open(9880):
                return jsonify({"status": "ready"})
        return jsonify({"status": "timeout"}), 500
    return jsonify({"status": "already_running"})


@app.route("/api/gvc/kill", methods=["POST"])
def kill_gvc():
    subprocess.call(
        ["taskkill", "/F", "/T", "/FI", "WINDOWTITLE eq AMADEUS_GVC*"], shell=True
    )
    return jsonify({"status": "terminated"})


@app.route("/api/voice_chat", methods=["POST"])
def voice_chat():
    # Voice chat için de chunking mantığını uygula (chat ile aynı yapı)
    agent = request.form.get("agent")
    voice_enabled = request.form.get("voice_enabled") == "true"
    audio_f = request.files["audio"]
    tmp = os.path.join(AUDIO_DIR, f"v_{uuid.uuid4().hex}.webm")
    audio_f.save(tmp)
    seg, _ = whisper_engine.transcribe(tmp)
    ut = "".join([s.text for s in seg]).strip()
    os.remove(tmp)
    if not ut:
        return jsonify({"error": "No audio"}), 400
    reply, h = get_logic(agent, ut)
    audio_url = None
    if voice_enabled:
        cleaned = clean_for_speech_final(reply)
        raw_sentences = [s.strip() for s in re.split(r"(?<=[.])", cleaned) if s.strip()]
        final_chunks = []
        current_chunk = ""
        for s in raw_sentences:
            if len(current_chunk) + len(s) < 70:
                current_chunk += " " + s
            else:
                if current_chunk:
                    final_chunks.append(current_chunk.strip())
                current_chunk = s
        if current_chunk:
            final_chunks.append(current_chunk.strip())
        if final_chunks:
            part_files = []
            msg_id = uuid.uuid4().hex
            for i, chunk in enumerate(final_chunks):
                p_p = os.path.join(AUDIO_DIR, f"v_p_{msg_id}_{i}.wav")
                if sovits_gen("  " + chunk + ".", p_p):
                    part_files.append(p_p)
            f_n = f"v_res_{msg_id}.wav"
            if merge_wavs(part_files, os.path.join(AUDIO_DIR, f_n)):
                audio_url = f"http://127.0.0.1:5000/audio/{f_n}"
    return jsonify(
        {"user_text": ut, "reply": reply, "history": h, "audio_url": audio_url}
    )


@app.route("/api/history")
def history():
    agent = request.args.get("agent", "Makise_Kurisu")
    if os.path.exists(f"{agent}.json"):
        with open(f"{agent}.json", "r", encoding="utf-8") as f:
            return jsonify(
                {"history": [m for m in json.load(f) if m["role"] != "system"]}
            )
    return jsonify({"history": []})


@app.route("/audio/<f>")
def serve_audio(f):
    return send_from_directory(AUDIO_DIR, f)


@app.route("/uigrounds/<path:filename>")
def serve_ui(filename):
    return send_from_directory(UIGROUNDS_DIR, filename)


if __name__ == "__main__":
    app.run(port=5000)
