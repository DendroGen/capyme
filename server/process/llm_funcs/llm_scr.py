import yaml
import json
import os
import sys
import uuid
from pathlib import Path
from openai import OpenAI
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from faster_whisper import WhisperModel

# --- SİHİRLİ DOKUNUŞ: Terminal nerede olursa olsun kendini hep ana klasörde sayacak ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)  # <-- BU SATIR HER ŞEYİ ÇÖZÜYOR

# Şimdi diğer dosyalarını güvenle çağırabiliriz
from process.tts_func.sovits_ping import sovits_gen

print("Config ve Whisper Yükleniyor. Lütfen bekleyin...")
# ... (Kodun geri kalanı aynı kalacak) ...
with open("character_config.yaml", "r", encoding="utf-8") as f:
    char_config = yaml.safe_load(f)

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

HISTORY_FILE = char_config.get("history_file", "chat_history.json")
MODEL = char_config.get("model", "llama3")

whisper_model = WhisperModel("base.en", device="cpu", compute_type="float32")

SYSTEM_TEXT = char_config["presets"]["default"]["system_prompt"]
SYSTEM_PROMPT = [{"role": "system", "content": SYSTEM_TEXT}]


# --- Hafıza (Memory) Fonksiyonları ---
def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return SYSTEM_PROMPT.copy()


def save_history(history):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


# Siteye SADECE konuşmaları gönderir (System promptunu gizler ve Index ekler)
def get_chat_history_only():
    messages = load_history()
    return [
        {"role": m["role"], "content": m["content"], "index": i}
        for i, m in enumerate(messages)
        if m["role"] != "system"
    ]


def llm_response(user_input, edit_index=None):
    messages = load_history()

    # EĞER DÜZENLEME (EDIT) YAPILIYORSA:
    # Verilen index'ten sonrasını (JSON'dan) tamamen siler.
    if edit_index is not None:
        try:
            edit_index = int(edit_index)
            if 0 < edit_index < len(messages):
                messages = messages[:edit_index]
        except ValueError:
            pass

    messages.append({"role": "user", "content": user_input})

    response = client.chat.completions.create(
        model=MODEL, messages=messages, temperature=0.7, max_tokens=2048
    )

    ai_text = response.choices[0].message.content

    messages.append({"role": "assistant", "content": ai_text})
    save_history(messages)

    return ai_text


# --- Flask Sunucusu ---
app = Flask(__name__)
CORS(app)

AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)


# Site açıldığında eski sohbeti yükler
@app.route("/api/history", methods=["GET"])
def history_endpoint():
    return jsonify({"history": get_chat_history_only()})


# Normal Yazı Sohbeti
@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.json
        user_text = data.get("message")
        edit_index = data.get("edit_index")  # Düzenlenen mesajın sırası (Varsa)

        ai_reply = llm_response(user_text, edit_index)

        return jsonify({"reply": ai_reply, "history": get_chat_history_only()})
    except Exception as e:
        print(f"\n[!!!] TEXT CHAT HATASI: {str(e)}\n")
        return jsonify({"reply": f"Error: {str(e)}"}), 500


# Sesli Sohbet
@app.route("/api/voice_chat", methods=["POST"])
def voice_chat_endpoint():
    try:
        if "audio" not in request.files:
            return jsonify({"error": "Ses dosyası alınamadı"}), 400

        audio_file = request.files["audio"]
        edit_index = request.form.get("edit_index")  # Düzenleme durumu

        temp_audio_path = os.path.join(AUDIO_DIR, f"temp_user_{uuid.uuid4().hex}.webm")
        audio_file.save(temp_audio_path)

        segments, _ = whisper_model.transcribe(temp_audio_path)
        user_text = "".join([segment.text for segment in segments]).strip()

        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

        if not user_text:
            return jsonify({"error": "Ses anlaşılamadı."}), 400

        ai_reply = llm_response(user_text, edit_index)

        output_filename = f"reply_{uuid.uuid4().hex}.wav"
        output_wav_path = os.path.join(AUDIO_DIR, output_filename)
        sovits_gen(ai_reply, output_wav_path)

        return jsonify(
            {
                "user_text": user_text,
                "reply": ai_reply,
                "audio_url": f"http://127.0.0.1:5000/audio/{output_filename}",
                "history": get_chat_history_only(),
            }
        )

    except Exception as e:
        print(f"\n[!!!] VOICE CHAT HATASI: {str(e)}\n")
        return jsonify({"error": str(e)}), 500


@app.route("/audio/<filename>")
def serve_audio(filename):
    return send_from_directory(AUDIO_DIR, filename)


if __name__ == "__main__":
    print("==================================================")
    print(" Kurisu Web & Ses Sunucusu Aktif! (Port 5000) ")
    print("==================================================")
    app.run(port=5000)
