import base64
import datetime
import io
import json
import os
import re
import socket
import subprocess
import sys
import unicodedata
import uuid
from typing import Any, Dict, List, Optional

import pytz
import requests
import yaml
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from PIL import Image
from faster_whisper import WhisperModel


# --------------------------------------------------
# 1. PATHS
# --------------------------------------------------
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LLM_FUNCS_DIR = CURRENT_DIR
PROCESS_DIR = os.path.dirname(LLM_FUNCS_DIR)
SERVER_DIR = os.path.dirname(PROCESS_DIR)
CAPYME_DIR = os.path.dirname(SERVER_DIR)
CAPYWEB_DIR = os.path.join(CAPYME_DIR, "capyweb")
DEPO_BASE = os.path.join(CAPYME_DIR, "depo")

sys.path.append(SERVER_DIR)
sys.path.append(PROCESS_DIR)
sys.path.append(LLM_FUNCS_DIR)

try:
    from process.tts_func.sovits_ping import sovits_gen
except Exception:
    try:
        from tts_func.sovits_ping import sovits_gen
    except Exception:
        from server.process.tts_func.sovits_ping import sovits_gen

try:
    from process.llm_funcs.scene_selector import choose_scene_visual
except Exception:
    try:
        from scene_selector import choose_scene_visual
    except Exception:
        from server.process.llm_funcs.scene_selector import choose_scene_visual

try:
    from process.llm_funcs.history_utils import (
        append_message,
        edit_user_message_and_truncate,
        ensure_system_message,
        load_history_file,
        save_history_file,
        visible_history,
    )
except Exception:
    try:
        from history_utils import (
            append_message,
            edit_user_message_and_truncate,
            ensure_system_message,
            load_history_file,
            save_history_file,
            visible_history,
        )
    except Exception:
        from server.process.llm_funcs.history_utils import (
            append_message,
            edit_user_message_and_truncate,
            ensure_system_message,
            load_history_file,
            save_history_file,
            visible_history,
        )

os.chdir(SERVER_DIR)


# --------------------------------------------------
# 2. GLOBAL DIRS
# --------------------------------------------------
AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
MEMORY_DIR = os.path.join(SERVER_DIR, "hafiza")
NOTES_DIR = os.path.join(SERVER_DIR, "notlar")
SETTINGS_DIR = os.path.join(SERVER_DIR, "app_settings")

UIGROUNDS_DIR = os.path.join(CAPYWEB_DIR, "uigrounds")
SOUNDS_DIR = os.path.join(CAPYWEB_DIR, "sounds")

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(MEMORY_DIR, exist_ok=True)
os.makedirs(NOTES_DIR, exist_ok=True)
os.makedirs(SETTINGS_DIR, exist_ok=True)
os.makedirs(UIGROUNDS_DIR, exist_ok=True)
os.makedirs(SOUNDS_DIR, exist_ok=True)

APP_SETTINGS_FILE = os.path.join(SETTINGS_DIR, "app_settings.json")

GSV2_PATH = r"C:\SVG\GSv2pro"
AGENTS_PASSWORD = "383666"


# --------------------------------------------------
# 3. HELPERS
# --------------------------------------------------
def ultra_clean_text(text: Optional[str]) -> str:
    if not text:
        return ""
    return text.strip()


def clean_for_voice(text: Optional[str]) -> str:
    if not text:
        return ""
    text = re.sub(r"\*.*?\*", " ", text, flags=re.DOTALL)
    text = re.sub(r"[^\w\s\.\,\!\?çğıöşüÇĞIÖŞÜ]", " ", text)
    return text.lower().strip()


def safe_agent_folder_name(name: str) -> str:
    if not name:
        return "Unnamed_Agent"

    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"[-\s]+", "_", name)
    return name or "Unnamed_Agent"


def sanitize_filename_keep_ext(filename: str) -> str:
    base, ext = os.path.splitext(filename)
    base = safe_agent_folder_name(base)
    ext = ext.lower()
    return f"{base}{ext}"


def now_istanbul() -> datetime.datetime:
    return datetime.datetime.now(pytz.timezone("Europe/Istanbul"))


def now_time_str() -> str:
    return now_istanbul().strftime("%H:%M:%S")


def is_port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def check_agents_password() -> bool:
    given = request.headers.get("X-Agents-Password", "")
    return given == AGENTS_PASSWORD


def load_yaml_config() -> Dict[str, Any]:
    config_path = os.path.join(SERVER_DIR, "agents_config.yaml")
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_json_safe(path: str, fallback: Any) -> Any:
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def save_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_agent_dir(agent_name: str) -> str:
    return os.path.join(UIGROUNDS_DIR, agent_name)


def get_agent_json_path(agent_name: str) -> str:
    return os.path.join(get_agent_dir(agent_name), "agent.json")


def get_agent_history_path(agent_name: str) -> str:
    return os.path.join(MEMORY_DIR, f"{agent_name}.json")


def get_agent_poses_dir(agent_name: str) -> str:
    return os.path.join(get_agent_dir(agent_name), "poses")


def get_agent_emotions_dir(agent_name: str) -> str:
    return os.path.join(get_agent_dir(agent_name), "emotions")


def get_agent_profile_candidates(agent_name: str) -> List[str]:
    agent_dir = get_agent_dir(agent_name)
    candidates = []
    for ext in ["jpg", "jpeg", "png", "webp", "gif"]:
        path = os.path.join(agent_dir, f"profile.{ext}")
        if os.path.exists(path):
            candidates.append(f"/uigrounds/{agent_name}/profile.{ext}")
    return candidates


def get_agent_background_candidates(agent_name: str) -> List[str]:
    agent_dir = get_agent_dir(agent_name)
    candidates = []
    for ext in ["jpg", "jpeg", "png", "webp", "gif"]:
        path = os.path.join(agent_dir, f"background.{ext}")
        if os.path.exists(path):
            candidates.append(f"/uigrounds/{agent_name}/background.{ext}")
    return candidates


def load_agent_data(agent_name: str) -> Optional[Dict[str, Any]]:
    path = get_agent_json_path(agent_name)
    if not os.path.exists(path):
        return None
    return load_json_safe(path, None)


def save_agent_data(agent_name: str, data: Dict[str, Any]) -> None:
    agent_dir = get_agent_dir(agent_name)
    os.makedirs(agent_dir, exist_ok=True)
    os.makedirs(get_agent_poses_dir(agent_name), exist_ok=True)
    os.makedirs(get_agent_emotions_dir(agent_name), exist_ok=True)
    save_json(get_agent_json_path(agent_name), data)


def delete_file_if_exists(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)


def replace_single_asset(upload, target_dir: str, base_name: str) -> Optional[str]:
    if not upload or not upload.filename:
        return None

    os.makedirs(target_dir, exist_ok=True)

    for ext in ["jpg", "jpeg", "png", "webp", "gif"]:
        delete_file_if_exists(os.path.join(target_dir, f"{base_name}.{ext}"))

    ext = os.path.splitext(upload.filename)[1].lower() or ".png"
    file_name = f"{base_name}{ext}"
    path = os.path.join(target_dir, file_name)
    upload.save(path)
    return file_name


def replace_visual_rows(
    agent_name: str,
    section_name: str,
    rows: List[Dict[str, Any]],
    upload_prefix: str,
) -> List[Dict[str, Any]]:
    if section_name not in ("poses", "emotions"):
        return []

    target_dir = (
        get_agent_poses_dir(agent_name)
        if section_name == "poses"
        else get_agent_emotions_dir(agent_name)
    )
    os.makedirs(target_dir, exist_ok=True)

    result = []

    for i, row in enumerate(rows):
        file_obj = request.files.get(f"{upload_prefix}_image_{i}")
        existing_file = (row.get("existing_file") or "").strip()

        final_file = existing_file

        if file_obj and file_obj.filename:
            clean_name = sanitize_filename_keep_ext(file_obj.filename)
            saved_path = os.path.join(target_dir, clean_name)
            file_obj.save(saved_path)
            final_file = f"{section_name}/{clean_name}"

        if not final_file:
            continue

        result.append(
            {
                "label": (row.get("label") or "").strip(),
                "description": (row.get("description") or "").strip(),
                "tags": (row.get("tags") or "").strip(),
                "file": final_file.replace("\\", "/"),
            }
        )

    return result


def parse_visual_rows_from_form(prefix: str) -> List[Dict[str, str]]:
    rows = []
    idx = 0

    while True:
        label_key = f"{prefix}_label_{idx}"
        desc_key = f"{prefix}_description_{idx}"
        tags_key = f"{prefix}_tags_{idx}"
        existing_key = f"{prefix}_existing_file_{idx}"

        has_any = (
            label_key in request.form
            or desc_key in request.form
            or tags_key in request.form
            or existing_key in request.form
            or f"{prefix}_image_{idx}" in request.files
        )

        if not has_any:
            break

        rows.append(
            {
                "label": request.form.get(label_key, ""),
                "description": request.form.get(desc_key, ""),
                "tags": request.form.get(tags_key, ""),
                "existing_file": request.form.get(existing_key, ""),
            }
        )
        idx += 1

    return rows


def build_default_system_prompt(
    display_name: str, personality: str, backstory: str, first_meeting: str
) -> str:
    return (
        f"You are {display_name}. "
        f"Your personality: {personality}. "
        f"Your backstory: {backstory}. "
        f"How you first met the user: {first_meeting}. "
        "Stay in character. Reply naturally in English. "
        "Do not repeat your backstory unless specifically asked. "
        "Move scenes forward with concrete actions and dialogue."
    )


def list_available_agents() -> List[Dict[str, Any]]:
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
            data = load_json_safe(agent_json, {})
            profile_candidates = get_agent_profile_candidates(item)
            background_candidates = get_agent_background_candidates(item)

            agents.append(
                {
                    "name": data.get("name", item),
                    "display_name": data.get("display_name", item.replace("_", " ")),
                    "age": data.get("age", ""),
                    "personality": data.get("personality", ""),
                    "backstory": data.get("backstory", ""),
                    "first_meeting": data.get("first_meeting", ""),
                    "theme": data.get("theme", {}),
                    "poses": data.get("poses", []),
                    "emotions": data.get("emotions", []),
                    "profile_url": f"http://127.0.0.1:5000{profile_candidates[0]}"
                    if profile_candidates
                    else None,
                    "background_url": f"http://127.0.0.1:5000{background_candidates[0]}"
                    if background_candidates
                    else None,
                }
            )
        except Exception as e:
            print(f"Agent load error ({item}): {e}")

    agents.sort(key=lambda x: x["display_name"].lower())
    return agents


# --------------------------------------------------
# 4. CONFIG / MODELS
# --------------------------------------------------
config_db = load_yaml_config()
MODEL_NAME = config_db.get("model_name", "mistral-nemo")
VISION_MODEL = "qwen3-vl:8b"

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)


# --------------------------------------------------
# 5. APP SETTINGS
# --------------------------------------------------
def default_app_settings() -> Dict[str, Any]:
    return {
        "home_theme": {
            "accent": "#a10000",
            "accent2": "#ff1b1b",
            "text": "#eeeeee",
            "panel": "rgba(12, 6, 6, 0.94)",
        },
        "home_audio": {
            "startup_file": "",
            "startup_volume": 0.6,
            "button_file": "",
            "button_volume": 0.6,
        },
    }


def load_app_settings() -> Dict[str, Any]:
    data = load_json_safe(APP_SETTINGS_FILE, default_app_settings())
    if not isinstance(data, dict):
        return default_app_settings()
    merged = default_app_settings()
    merged.update(data)
    if "home_theme" in data and isinstance(data["home_theme"], dict):
        merged["home_theme"].update(data["home_theme"])
    if "home_audio" in data and isinstance(data["home_audio"], dict):
        merged["home_audio"].update(data["home_audio"])
    return merged


def save_app_settings(data: Dict[str, Any]) -> None:
    save_json(APP_SETTINGS_FILE, data)


# --------------------------------------------------
# 6. VISION
# --------------------------------------------------
def get_vision_analysis(
    user_msg: str, page_no: Optional[str] = None, direct_b64: Optional[str] = None
) -> str:
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


# --------------------------------------------------
# 7. EMOTION
# --------------------------------------------------
def detect_emotion(text: str) -> str:
    text = (text or "").lower()

    if any(
        word in text
        for word in ["angry", "shut up", "idiot", "dummy", "annoying", "bothering"]
    ):
        return "angry_shout"

    if any(word in text for word in ["blush", "embarrass", "warm", "softly", "shy"]):
        return "shy_overheat"

    if any(
        word in text
        for word in [
            "theory",
            "calculate",
            "science",
            "geometry",
            "analyze",
            "prototype",
        ]
    ):
        return "thinking"

    if any(word in text for word in ["sleepy", "tired", "yawn", "late", "night"]):
        return "sleepy"

    return "shy_mild"


# --------------------------------------------------
# 8. LLM CORE
# --------------------------------------------------
def build_messages_for_model(
    history: List[Dict[str, Any]], current_time: str
) -> List[Dict[str, str]]:
    messages_to_send = [{"role": m["role"], "content": m["content"]} for m in history]

    if messages_to_send and messages_to_send[0]["role"] == "system":
        messages_to_send[0]["content"] += (
            "\n\n[ROLEPLAY ENGINE:"
            " Stay in the current scene."
            " Do not repeat backstory."
            " Do not reintroduce yourself unless asked."
            " Use actions inside *asterisks*."
            " Each reply must be immersive and proactive."
            " Prefer 2-5 sentences."
            " React directly to the user's last message."
            " No emojis."
            f" Current time: {current_time}."
            "]"
        )

    return messages_to_send


def get_logic(agent: str, txt: str, image_b64: Optional[str] = None) -> Dict[str, Any]:
    now = now_istanbul()
    current_time = now.strftime("%H:%M")
    timestamp = now.strftime("%H:%M:%S")

    if txt == "[IDLE_PING_60]":
        txt = (
            "[SYSTEM: The user hasn't typed anything for exactly 1 hour. "
            f"Current time is {current_time}. "
            "Send a short in-character message.]"
        )

    history_path = get_agent_history_path(agent)
    history = load_history_file(history_path)

    agent_data = load_agent_data(agent)
    if agent_data:
        system_prompt = agent_data.get("system_prompt", "You are an AI assistant.")
    else:
        fallback_agent = config_db.get(agent, config_db.get("Default_Agent", {}))
        system_prompt = fallback_agent.get("system_prompt", "You are an AI assistant.")

    history = ensure_system_message(history, system_prompt)

    if image_b64:
        analysis = get_vision_analysis(txt, direct_b64=image_b64)

        if "ERROR" in analysis or "TIMEOUT" in analysis:
            txt = f"[SYSTEM: The user sent an image but the vision model failed.] User: {txt}"
        else:
            txt = (
                "[SYSTEM: The user sent an image. "
                f"Vision Model analysis: '{analysis}'. "
                "Respond based on this analysis.] "
                f"User: {txt}"
            )
    else:
        geo_match = re.search(r"(?:sayfa|page)\s*(\d+)", txt.lower())
        if geo_match:
            page_no = geo_match.group(1)
            analysis = get_vision_analysis(txt, page_no=page_no)
            txt = f"[SYSTEM: Visual data for page {page_no}: {analysis}. Solve it.] User: {txt}"

    if txt and txt != "[IDLE_PING_60]":
        history = append_message(history, "user", txt, timestamp)

    messages_to_send = build_messages_for_model(history, current_time)

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages_to_send,
        extra_body={"options": {"temperature": 0.72, "repeat_penalty": 1.15}},
    )

    ai = response.choices[0].message.content or ""
    ai = re.sub(r"\s*\(Translation:.*?\)", "", ai, flags=re.IGNORECASE)
    ai = re.sub(r"\s*\[Translation:.*?\]", "", ai, flags=re.IGNORECASE)
    ai = ai.strip()

    if not ai:
        ai = "*Looks at you silently...*"

    history = append_message(history, "assistant", ai, now_time_str())
    save_history_file(history_path, history)

    scene_visual = choose_scene_visual(get_agent_dir(agent), agent, ai)

    return {
        "reply": ai,
        "history": visible_history(history),
        "emotion": detect_emotion(ai),
        "scene_visual": scene_visual,
    }


# --------------------------------------------------
# 9. ROUTES
# --------------------------------------------------
@app.route("/index.html")
def serve_index_html():
    return send_from_directory(CAPYWEB_DIR, "index.html")


@app.route("/")
def serve_root():
    return send_from_directory(CAPYWEB_DIR, "index.html")


@app.route("/css/<path:filename>")
def serve_css(filename: str):
    return send_from_directory(os.path.join(CAPYWEB_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def serve_js(filename: str):
    return send_from_directory(os.path.join(CAPYWEB_DIR, "js"), filename)


@app.route("/audio/<path:filename>")
def serve_audio(filename: str):
    return send_from_directory(AUDIO_DIR, filename)


@app.route("/uigrounds/<path:filename>")
def serve_ui(filename: str):
    return send_from_directory(UIGROUNDS_DIR, filename)


@app.route("/sounds/<path:filename>")
def serve_sounds(filename: str):
    return send_from_directory(SOUNDS_DIR, filename)


@app.route("/api/app_settings", methods=["GET"])
def api_get_app_settings():
    return jsonify(load_app_settings())


@app.route("/api/app_settings", methods=["POST"])
def api_save_app_settings():
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

    try:
        current = load_app_settings()

        current["home_theme"]["accent"] = request.form.get(
            "accent", current["home_theme"]["accent"]
        ).strip()
        current["home_theme"]["accent2"] = request.form.get(
            "accent2", current["home_theme"]["accent2"]
        ).strip()
        current["home_theme"]["text"] = request.form.get(
            "text", current["home_theme"]["text"]
        ).strip()
        current["home_theme"]["panel"] = request.form.get(
            "panel", current["home_theme"]["panel"]
        ).strip()

        current["home_audio"]["startup_volume"] = float(
            request.form.get("startup_volume", current["home_audio"]["startup_volume"])
        )
        current["home_audio"]["button_volume"] = float(
            request.form.get("button_volume", current["home_audio"]["button_volume"])
        )

        startup_file = request.files.get("startup_audio")
        button_file = request.files.get("button_audio")

        if startup_file and startup_file.filename:
            clean_name = (
                f"home_startup_{sanitize_filename_keep_ext(startup_file.filename)}"
            )
            startup_path = os.path.join(SOUNDS_DIR, clean_name)
            startup_file.save(startup_path)
            current["home_audio"]["startup_file"] = f"/sounds/{clean_name}"

        if button_file and button_file.filename:
            clean_name = (
                f"home_button_{sanitize_filename_keep_ext(button_file.filename)}"
            )
            button_path = os.path.join(SOUNDS_DIR, clean_name)
            button_file.save(button_path)
            current["home_audio"]["button_file"] = f"/sounds/{clean_name}"

        save_app_settings(current)
        return jsonify({"status": "success", "settings": current})
    except Exception as e:
        print(f"App settings save error: {e}")
        return jsonify({"error": "Failed to save app settings"}), 500


@app.route("/api/app_settings/default", methods=["POST"])
def api_reset_app_settings():
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

    settings = default_app_settings()
    save_app_settings(settings)
    return jsonify({"status": "success", "settings": settings})


@app.route("/api/agents/auth", methods=["POST"])
def api_agents_auth():
    if not check_agents_password():
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return jsonify({"ok": True})


@app.route("/api/agents", methods=["GET"])
def api_list_agents():
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"agents": list_available_agents()})


@app.route("/api/agents/<agent_name>", methods=["GET"])
def api_get_agent(agent_name: str):
    data = load_agent_data(agent_name)
    if not data:
        return jsonify({"error": "Agent not found"}), 404

    profile_candidates = get_agent_profile_candidates(agent_name)
    background_candidates = get_agent_background_candidates(agent_name)

    data["profile_candidates"] = [
        f"http://127.0.0.1:5000{p}" for p in profile_candidates
    ]
    data["background_candidates"] = [
        f"http://127.0.0.1:5000{p}" for p in background_candidates
    ]

    return jsonify(data)


@app.route("/api/agents/create", methods=["POST"])
def api_create_agent():
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

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
        os.makedirs(get_agent_poses_dir(agent_name), exist_ok=True)
        os.makedirs(get_agent_emotions_dir(agent_name), exist_ok=True)

        profile_file = request.files.get("profile_image")
        background_file = request.files.get("background_image")

        replace_single_asset(profile_file, agent_dir, "profile")
        replace_single_asset(background_file, agent_dir, "background")

        if not display_name:
            display_name = raw_name

        if not system_prompt:
            system_prompt = build_default_system_prompt(
                display_name, personality, backstory, first_meeting
            )

        pose_rows = parse_visual_rows_from_form("pose")
        emotion_rows = parse_visual_rows_from_form("emotion")

        poses = replace_visual_rows(agent_name, "poses", pose_rows, "pose")
        emotions = replace_visual_rows(agent_name, "emotions", emotion_rows, "emotion")

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
            "poses": poses,
            "emotions": emotions,
        }

        save_agent_data(agent_name, agent_data)
        return jsonify({"status": "success", "agent": agent_data})
    except Exception as e:
        print(f"Create agent error: {e}")
        return jsonify({"error": "Failed to create agent"}), 500


@app.route("/api/agents/<agent_name>/update", methods=["POST"])
def api_update_agent(agent_name: str):
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

    existing = load_agent_data(agent_name)
    if not existing:
        return jsonify({"error": "Agent not found"}), 404

    try:
        display_name = request.form.get(
            "display_name", existing.get("display_name", "")
        ).strip()
        age = request.form.get("age", existing.get("age", "")).strip()
        personality = request.form.get(
            "personality", existing.get("personality", "")
        ).strip()
        backstory = request.form.get("backstory", existing.get("backstory", "")).strip()
        first_meeting = request.form.get(
            "first_meeting", existing.get("first_meeting", "")
        ).strip()
        system_prompt = request.form.get(
            "system_prompt", existing.get("system_prompt", "")
        ).strip()

        accent = request.form.get(
            "accent", existing.get("theme", {}).get("accent", "#a10000")
        ).strip()
        accent2 = request.form.get(
            "accent2", existing.get("theme", {}).get("accent2", "#ff1b1b")
        ).strip()
        panel = request.form.get(
            "panel", existing.get("theme", {}).get("panel", "rgba(12, 6, 6, 0.94)")
        ).strip()
        text_color = request.form.get(
            "text", existing.get("theme", {}).get("text", "#eeeeee")
        ).strip()

        profile_file = request.files.get("profile_image")
        background_file = request.files.get("background_image")

        if profile_file and profile_file.filename:
            replace_single_asset(profile_file, get_agent_dir(agent_name), "profile")

        if background_file and background_file.filename:
            replace_single_asset(
                background_file, get_agent_dir(agent_name), "background"
            )

        if not system_prompt:
            system_prompt = build_default_system_prompt(
                display_name, personality, backstory, first_meeting
            )

        pose_rows = parse_visual_rows_from_form("pose")
        emotion_rows = parse_visual_rows_from_form("emotion")

        poses = replace_visual_rows(agent_name, "poses", pose_rows, "pose")
        emotions = replace_visual_rows(agent_name, "emotions", emotion_rows, "emotion")

        updated = {
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
            "poses": poses,
            "emotions": emotions,
        }

        save_agent_data(agent_name, updated)
        return jsonify({"status": "success", "agent": updated})
    except Exception as e:
        print(f"Update agent error: {e}")
        return jsonify({"error": "Failed to update agent"}), 500


@app.route("/api/agents/<agent_name>", methods=["DELETE"])
def api_delete_agent(agent_name: str):
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

    agent_dir = get_agent_dir(agent_name)
    history_path = get_agent_history_path(agent_name)

    if not os.path.exists(agent_dir):
        return jsonify({"error": "Agent not found"}), 404

    try:
        for root, dirs, files in os.walk(agent_dir, topdown=False):
            for file in files:
                os.remove(os.path.join(root, file))
            for d in dirs:
                os.rmdir(os.path.join(root, d))
        os.rmdir(agent_dir)

        if os.path.exists(history_path):
            os.remove(history_path)

        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Delete agent error: {e}")
        return jsonify({"error": "Failed to delete agent"}), 500


@app.route("/api/chat", methods=["POST"])
def api_chat():
    try:
        d = request.json or {}
        agent = d.get("agent", "Makise_Kurisu")
        message = d.get("message", "")
        image_b64 = d.get("image_b64")

        result = get_logic(agent, message, image_b64=image_b64)

        reply = ultra_clean_text(result["reply"])
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
                "history": result["history"],
                "audio_url": audio_url,
                "emotion": result["emotion"],
                "scene_visual": result["scene_visual"],
            }
        )
    except Exception as e:
        print(f"Chat API Error: {e}")
        return jsonify({"reply": "*System error, Lab Mem.*", "emotion": "sad"}), 500


@app.route("/api/voice_chat", methods=["POST"])
def api_voice_chat():
    try:
        agent = request.form.get("agent", "Makise_Kurisu")
        v_enabled = request.form.get("voice_enabled") == "true"
        audio_f = request.files["audio"]

        tmp = os.path.join(AUDIO_DIR, f"v_{uuid.uuid4().hex}.webm")
        audio_f.save(tmp)

        segs, _ = whisper_engine.transcribe(tmp)
        ut = "".join([s.text for s in segs]).strip()

        try:
            os.remove(tmp)
        except Exception:
            pass

        if not ut:
            return jsonify({"error": "No audio"}), 400

        result = get_logic(agent, ut)
        reply = ultra_clean_text(result["reply"])

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
                "history": result["history"],
                "audio_url": audio_url,
                "emotion": result["emotion"],
                "scene_visual": result["scene_visual"],
            }
        )
    except Exception as e:
        print(f"Voice Chat Error: {e}")
        return jsonify({"reply": "*Error*", "emotion": "sad"}), 500


@app.route("/api/history", methods=["GET"])
def api_history():
    agent = request.args.get("agent", "Makise_Kurisu")
    history_path = get_agent_history_path(agent)
    history = load_history_file(history_path)
    return jsonify({"history": visible_history(history)})


@app.route("/api/history/edit", methods=["POST"])
def api_history_edit():
    try:
        d = request.json or {}
        agent = d.get("agent", "Makise_Kurisu")
        visible_index = int(d.get("visible_index"))
        new_content = (d.get("new_content") or "").strip()

        history_path = get_agent_history_path(agent)
        history = load_history_file(history_path)

        if not history:
            return jsonify({"error": "History not found"}), 404

        history = edit_user_message_and_truncate(history, visible_index, new_content)
        save_history_file(history_path, history)

        return jsonify({"status": "success", "history": visible_history(history)})
    except Exception as e:
        print(f"History edit error: {e}")
        return jsonify({"error": "Failed to edit history"}), 500


@app.route("/api/clear_history", methods=["POST"])
def api_clear_history():
    agent = request.args.get("agent", "Makise_Kurisu")
    history_path = get_agent_history_path(agent)

    if os.path.exists(history_path):
        os.remove(history_path)

    return jsonify({"status": "success"})


@app.route("/api/gvc/start", methods=["POST"])
def api_start_gvc():
    if not is_port_open(9880):
        os.system(
            f'start "AMADEUS_GVC" /min cmd /c "cd /d {GSV2_PATH} && runtime\\python.exe api_v2.py -a 127.0.0.1 -p 9880"'
        )
        return jsonify({"status": "ready"})
    return jsonify({"status": "running"})


@app.route("/api/gvc/kill", methods=["POST"])
def api_kill_gvc():
    subprocess.call(
        ["taskkill", "/F", "/T", "/FI", "WINDOWTITLE eq AMADEUS_GVC*"],
        shell=True,
    )
    return jsonify({"status": "terminated"})


if __name__ == "__main__":
    app.run(port=5000, debug=False)
