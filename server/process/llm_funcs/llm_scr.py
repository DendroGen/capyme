import yaml
import json
import os
from openai import OpenAI
from flask import Flask, request, jsonify
from flask_cors import CORS

# Ayarları okuyoruz
with open("character_config.yaml", "r", encoding="utf-8") as f:
    char_config = yaml.safe_load(f)

# Ollama'ya bağlanıyoruz
client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

HISTORY_FILE = char_config.get("history_file", "chat_history.json")
MODEL = char_config.get("model", "llama3")

# Ollama'nın sevdiği standart sistem prompt formatı
SYSTEM_TEXT = char_config["presets"]["default"]["system_prompt"]
SYSTEM_PROMPT = [{"role": "system", "content": SYSTEM_TEXT}]


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


def llm_response(user_input):
    messages = load_history()

    # Kullanıcı mesajını standart string formatında ekliyoruz
    messages.append({"role": "user", "content": user_input})

    # Modele soruyoruz
    response = client.chat.completions.create(
        model=MODEL, messages=messages, temperature=0.7, max_tokens=2048
    )

    ai_text = response.choices[0].message.content

    # Yapay zeka cevabını geçmişe ekleyip kaydediyoruz
    messages.append({"role": "assistant", "content": ai_text})
    save_history(messages)

    return ai_text


# ==========================================
# WEB SİTESİ İÇİN API KÖPRÜSÜ (FLASK)
# ==========================================
app = Flask(__name__)
CORS(app)


@app.route("/api/chat", methods=["POST"])
def chat_endpoint():
    try:
        data = request.json
        user_text = data.get("message")

        # LLM fonksiyonumuzu çağırıp cevabı alıyoruz
        ai_reply = llm_response(user_text)

        return jsonify({"reply": ai_reply})
    except Exception as e:
        print(f"\n[!!!] OLLAMA/PYTHON HATASI: {str(e)}\n")
        return jsonify({"reply": f"Hata oluştu: {str(e)}"}), 500


if __name__ == "__main__":
    print("Web API Sunucusu Başlatıldı! Siteyi açabilirsiniz... (Port 5000)")
    app.run(port=5000)
