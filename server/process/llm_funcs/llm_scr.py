import yaml, json, os, sys, uuid, datetime, socket, time, re, subprocess, unicodedata
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from faster_whisper import WhisperModel
import pytz
import base64
from PIL import Image
import io


# --- 1. YOL AYARLARI ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
DEPO_BASE = os.path.abspath(os.path.join(SERVER_DIR, "../depo"))

sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)

from process.tts_func.sovits_ping import sovits_gen

MEMORY_DIR = os.path.join(SERVER_DIR, "hafiza")
os.makedirs(MEMORY_DIR, exist_ok=True)


# --- 2. TEMİZLİK VE AYARLAR ---
def ultra_clean_text(text):
    if not text:
        return ""
    return text.strip()


def clean_for_voice(text):
    if not text:
        return ""
    text = re.sub(r"\*.*?\*", " ", text, flags=re.DOTALL)
    text = re.sub(r"[^\w\s\.\,\!\?çğıöşüÇĞIÖŞÜ]", " ", text)
    return text.lower().strip()


with open("agents_config.yaml", "r", encoding="utf-8") as f:
    config_db = yaml.safe_load(f)

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL_NAME = config_db.get("model_name", "mistral-nemo")
VISION_MODEL = "qwen3-vl:8b"
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)

AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
UIGROUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/uigrounds"))
SOUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/sounds"))
os.makedirs(AUDIO_DIR, exist_ok=True)

GSV2_PATH = r"C:\SVG\GSv2pro"


# --- 2.5 AGENT DOSYA YARDIMCILARI ---
def safe_agent_folder_name(name):
    if not name:
        return "Unnamed_Agent"

    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"[-\s]+", "_", name)

    return name or "Unnamed_Agent"


def get_agent_dir(agent_name):
    return os.path.join(UIGROUNDS_DIR, agent_name)


def get_agent_json_path(agent_name):
    return os.path.join(get_agent_dir(agent_name), "agent.json")


def load_agent_data(agent_name):
    agent_json = get_agent_json_path(agent_name)

    if os.path.exists(agent_json):
        with open(agent_json, "r", encoding="utf-8") as f:
            return json.load(f)

    return None


def save_agent_data(agent_name, data):
    agent_dir = get_agent_dir(agent_name)
    os.makedirs(agent_dir, exist_ok=True)

    with open(get_agent_json_path(agent_name), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def list_available_agents():
    agents = []

    if not os.path.exists(UIGROUNDS_DIR):
        return agents

    for item in os.listdir(UIGROUNDS_DIR):
        agent_dir = os.path.join(UIGROUNDS_DIR, item)

        if not os.path.isdir(agent_dir):
            continue

        agent_json = os.path.join(agent_dir, "agent.json")
        if not os.path.exists(agent_json):
            continue

        try:
            with open(agent_json, "r", encoding="utf-8") as f:
                data = json.load(f)

            profile_url = None
            for ext in ["jpg", "png", "jpeg", "webp"]:
                profile_path = os.path.join(agent_dir, f"profile.{ext}")
                if os.path.exists(profile_path):
                    profile_url = (
                        f"http://127.0.0.1:5000/uigrounds/{item}/profile.{ext}"
                    )
                    break

            agents.append(
                {
                    "name": data.get("name", item),
                    "display_name": data.get("display_name", item.replace("_", " ")),
                    "age": data.get("age", ""),
                    "personality": data.get("personality", ""),
                    "backstory": data.get("backstory", ""),
                    "first_meeting": data.get("first_meeting", ""),
                    "theme": data.get("theme", {}),
                    "profile_url": profile_url,
                }
            )

        except Exception as e:
            print(f"Agent load error ({item}): {e}")

    agents.sort(key=lambda x: x["display_name"].lower())
    return agents


# --- 3. VİZYON MOTORU (İNGİLİZCE QWEN) ---
def get_vision_analysis(user_msg, page_no=None, direct_b64=None):
    b64_img = None

    if direct_b64:
        b64_img = direct_b64.split(",")[1] if "," in direct_b64 else direct_b64

    elif page_no:
        img_path = os.path.join(
            DEPO_BASE, "geometri", "analitikgeometri1", f"sayfa_{page_no}.jpg"
        )

        if not os.path.exists(img_path):
            return "IMAGE_NOT_FOUND"

        img = Image.open(img_path)
        img.thumbnail((1024, 1024))

        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=85)
        b64_img = base64.b64encode(buffered.getvalue()).decode("utf-8")

    else:
        return "NO_IMAGE"

    try:
        # Prompt tamamıyla İngilizce
        payload = {
            "model": VISION_MODEL,
            "prompt": (
                "Please analyze this image carefully. What is in it? "
                "If there is text, math formulas, or questions, read and solve them. "
                f"Reply ONLY in English. User's note: {user_msg}"
            ),
            "images": [b64_img],
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 300},
        }

        response = requests.post(
            "http://localhost:11434/api/generate",
            json=payload,
            timeout=180,
        )
        return response.json().get("response", "")

    except Exception as e:
        return f"ERROR: {str(e)}"


# --- 4. BEYİN FONKSİYONU ---
# --- 4. BEYİN FONKSİYONU ---
def get_logic(agent, txt, image_b64=None):
    now = datetime.datetime.now(pytz.timezone("Europe/Istanbul"))
    current_time = now.strftime("%H:%M")

    if txt == "[IDLE_PING_60]":
        txt = (
            "[SYSTEM: The user hasn't typed anything for exactly 1 hour. "
            f"Current time is {current_time}. "
            "Send a short message staying in character.]"
        )

    f = os.path.join(MEMORY_DIR, f"{agent}.json")

    if os.path.exists(f):
        with open(f, "r", encoding="utf-8") as file:
            h = json.load(file)
    else:
        agent_data = load_agent_data(agent)

        if agent_data:
            system_prompt = agent_data.get("system_prompt", "You are an AI assistant.")
        else:
            fallback_agent = config_db.get(agent, config_db.get("Default_Agent", {}))
            system_prompt = fallback_agent.get(
                "system_prompt", "You are an AI assistant."
            )

        h = [{"role": "system", "content": system_prompt.strip()}]

    if image_b64:
        analysis = get_vision_analysis(txt, direct_b64=image_b64)

        if "ERROR" in analysis or "TIMEOUT" in analysis:
            txt = f"[SYSTEM: The user sent an image but the vision model failed.] User: {txt}"
        else:
            txt = (
                "[SYSTEM: The user sent an image. "
                f"Vision Model (Qwen) analysis: '{analysis}'. "
                "Provide a clever response based ONLY on this analysis.] "
                f"User: {txt}"
            )
    else:
        geo_match = re.search(r"(?:sayfa|page)\s*(\d+)", txt.lower())
        if geo_match:
            page_no = geo_match.group(1)
            analysis = get_vision_analysis(txt, page_no=page_no)
            txt = f"[SYSTEM: Visual data for page {page_no}: {analysis}. Solve it.] User: {txt}"

    if txt and txt != "[IDLE_PING_60]":
        ts = now.strftime("%H:%M:%S")
        h.append({"role": "user", "content": txt, "timestamp": ts})

    messages_to_send = [{"role": m["role"], "content": m["content"]} for m in h]

    # --- İNGİLİZCE KATI KURALLAR ---
    if len(messages_to_send) > 0 and messages_to_send[0]["role"] == "system":
        messages_to_send[0]["content"] += (
            "\n\n[ROLEPLAY ENGINE:"
            "Stay in the scene."
            "Do not repeat backstory."
            "Do not introduce yourself again."
            "Use both actions and dialogue."
            "Each reply MUST include at least 2 actions."
            "Each reply should be 2-4 sentences."
            "Move the scene forward logically."
            "React directly to the user's last message."
            "Do not stall or freeze."
            "No emojis.]"
        )

    r = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages_to_send,
        extra_body={"options": {"temperature": 0.7, "repeat_penalty": 1.15}},
    )

    ai = r.choices[0].message.content

    # Çeviri parantezlerini silen güvenliği İngilizce notlara göre de ayarladım
    if ai:
        ai = re.sub(r"\s*\(Translation:.*?\)", "", ai, flags=re.IGNORECASE)
        ai = re.sub(r"\s*\[Translation:.*?\]", "", ai, flags=re.IGNORECASE)
        ai = ai.strip()

    if not ai or ai == "":
        ai = "*Looks at you silently...*"

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


def detect_emotion(text):
    text = text.lower()

    if any(
        word in text
        for word in ["baka", "shut up", "stupid", "christina", "idiot", "dummy"]
    ):
        return "angry_shout"

    if any(word in text for word in ["cute", "blush", "pervert", "embarrassing"]):
        return "shy_overheat"

    if any(
        word in text
        for word in ["theory", "calculate", "science", "geometry", "analyze"]
    ):
        return "thinking"

    return "shy_mild"


# --- 5. FLASK ROUTES ---
@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        d = request.json

        reply, h = get_logic(
            d.get("agent", "Makise_Kurisu"),
            d.get("message"),
            d.get("image_b64"),
        )

        reply = ultra_clean_text(reply)
        emotion = detect_emotion(reply)
        audio_url = None

        if d.get("voice_enabled") and is_port_open(9880):
            v_text = clean_for_voice(reply)
            msg_id = uuid.uuid4().hex
            f_name = f"res_{msg_id}.wav"
            p_p = os.path.join(AUDIO_DIR, f_name)

            if sovits_gen(" " + v_text, p_p):
                audio_url = f"http://127.0.0.1:5000/audio/{f_name}"

        return jsonify(
            {
                "reply": reply,
                "history": h,
                "audio_url": audio_url,
                "emotion": emotion,
            }
        )

    except Exception as e:
        print(f"Chat API Error: {e}")
        return jsonify({"reply": "*System error, Lab Mem.*", "emotion": "sad"})


@app.route("/api/voice_chat", methods=["POST"])
def voice_chat():
    try:
        agent = request.form.get("agent")
        v_enabled = request.form.get("voice_enabled") == "true"
        audio_f = request.files["audio"]

        tmp = os.path.join(AUDIO_DIR, f"v_{uuid.uuid4().hex}.webm")
        audio_f.save(tmp)

        segs, _ = whisper_engine.transcribe(tmp)
        ut = "".join([s.text for s in segs]).strip()

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

        if v_enabled and is_port_open(9880):
            v_text = clean_for_voice(reply)
            msg_id = uuid.uuid4().hex
            f_name = f"vres_{msg_id}.wav"
            p_p = os.path.join(AUDIO_DIR, f_name)

            if sovits_gen(" " + v_text, p_p):
                audio_url = f"http://127.0.0.1:5000/audio/{f_name}"

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
        print(f"Voice Chat Error: {e}")
        return jsonify({"reply": "*Error*", "emotion": "sad"})


@app.route("/api/clear_history", methods=["POST"])
def clear_history():
    agent = request.args.get("agent", "Makise_Kurisu")
    f = os.path.join(MEMORY_DIR, f"{agent}.json")

    if os.path.exists(f):
        os.remove(f)

    return jsonify({"status": "success"})


@app.route("/api/agents", methods=["GET"])
def api_list_agents():
    try:
        return jsonify({"agents": list_available_agents()})
    except Exception as e:
        print(f"Agents list error: {e}")
        return jsonify({"agents": []}), 500


@app.route("/api/agents/<agent_name>", methods=["GET"])
def api_get_agent(agent_name):
    try:
        data = load_agent_data(agent_name)
        if not data:
            return jsonify({"error": "Agent not found"}), 404
        return jsonify(data)
    except Exception as e:
        print(f"Agent get error: {e}")
        return jsonify({"error": "Failed to load agent"}), 500


@app.route("/api/agents/create", methods=["POST"])
def api_create_agent():
    try:
        raw_name = request.form.get("name", "").strip()
        display_name = request.form.get("display_name", "").strip()
        age = request.form.get("age", "").strip()
        personality = request.form.get("personality", "").strip()
        backstory = request.form.get("backstory", "").strip()
        first_meeting = request.form.get("first_meeting", "").strip()
        system_prompt = request.form.get("system_prompt", "").strip()
        accent = request.form.get("accent", "#a10000").strip()
        accent2 = request.form.get("accent2", "#ff1b1b").strip()
        panel = request.form.get("panel", "rgba(12, 6, 6, 0.94)").strip()
        text_color = request.form.get("text", "#eeeeee").strip()

        if not raw_name:
            return jsonify({"error": "Agent name is required"}), 400

        agent_name = safe_agent_folder_name(raw_name)
        agent_dir = get_agent_dir(agent_name)

        if os.path.exists(agent_dir):
            return jsonify({"error": "An agent with this name already exists"}), 400

        os.makedirs(agent_dir, exist_ok=True)

        profile_file = request.files.get("profile_image")
        background_file = request.files.get("background_image")

        if profile_file and profile_file.filename:
            profile_ext = os.path.splitext(profile_file.filename)[1].lower() or ".jpg"
            profile_save_path = os.path.join(agent_dir, f"profile{profile_ext}")
            profile_file.save(profile_save_path)

        if background_file and background_file.filename:
            bg_ext = os.path.splitext(background_file.filename)[1].lower() or ".jpg"
            bg_save_path = os.path.join(agent_dir, f"background{bg_ext}")
            background_file.save(bg_save_path)

        if not display_name:
            display_name = raw_name

        if not system_prompt:
            system_prompt = (
                f"You are {display_name}. "
                f"Your personality: {personality}. "
                f"Your backstory: {backstory}. "
                f"How you first met the user: {first_meeting}. "
                "Always reply in natural, conversational English."
            )

        agent_data = {
            "name": agent_name,
            "display_name": display_name,
            "age": age,
            "personality": personality,
            "backstory": backstory,
            "first_meeting": first_meeting,
            "system_prompt": system_prompt,
            "theme": {
                "accent": accent,
                "accent2": accent2,
                "panel": panel,
                "text": text_color,
            },
        }

        save_agent_data(agent_name, agent_data)

        return jsonify({"status": "success", "agent": agent_data})

    except Exception as e:
        print(f"Create agent error: {e}")
        return jsonify({"error": "Failed to create agent"}), 500


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

    f = os.path.join(MEMORY_DIR, f"{agent}.json")

    print("HISTORY PATH:", f)  # DEBUG

    if os.path.exists(f):
        with open(f, "r", encoding="utf-8") as file:
            return jsonify(
                {"history": [m for m in json.load(file) if m["role"] != "system"]}
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
        ["taskkill", "/F", "/T", "/FI", "WINDOWTITLE eq AMADEUS_GVC*"],
        shell=True,
    )
    return jsonify({"status": "terminated"})


if __name__ == "__main__":
    app.run(port=5000)
