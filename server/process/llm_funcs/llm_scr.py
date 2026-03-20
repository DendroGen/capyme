import base64
import datetime
import io
import json
import os
import re
import socket
import subprocess
import sys
import uuid

import pytz
import requests
import yaml
from PIL import Image
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from faster_whisper import WhisperModel
from openai import OpenAI

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
DEPO_BASE = os.path.abspath(os.path.join(SERVER_DIR, "../depo"))

sys.path.append(SERVER_DIR)
os.chdir(SERVER_DIR)

from process.llm_funcs.agent_store import AgentStore, safe_agent_folder_name
from process.llm_funcs.auth_utils import check_agents_password
from process.llm_funcs.roleplay_utils import (
    build_idle_ping,
    clean_for_voice,
    detect_emotion,
    prepare_messages,
    strip_translation_noise,
    ultra_clean_text,
)
from process.llm_funcs.scene_selector import choose_scene_visual
from process.tts_func.sovits_ping import sovits_gen

MEMORY_DIR = os.path.join(SERVER_DIR, "hafiza")
os.makedirs(MEMORY_DIR, exist_ok=True)

AUDIO_DIR = os.path.join(SERVER_DIR, "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

UIGROUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/uigrounds"))
SOUNDS_DIR = os.path.abspath(os.path.join(SERVER_DIR, "../capyweb/sounds"))
GSV2_PATH = r"C:\SVG\GSv2pro"

agent_store = AgentStore(UIGROUNDS_DIR)

with open("agents_config.yaml", "r", encoding="utf-8") as f:
    config_db = yaml.safe_load(f)

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
MODEL_NAME = config_db.get("model_name", "mistral-nemo")
VISION_MODEL = "qwen3-vl:8b"
whisper_engine = WhisperModel("base.en", device="cpu", compute_type="float32")

app = Flask(__name__)
CORS(app)


def get_memory_path(agent_name: str) -> str:
    return os.path.join(MEMORY_DIR, f"{agent_name}.json")


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


def get_logic(agent, txt, image_b64=None):
    now = datetime.datetime.now(pytz.timezone("Europe/Istanbul"))
    current_time = now.strftime("%H:%M")
    memory_path = get_memory_path(agent)

    if txt == "[IDLE_PING_60]":
        txt = build_idle_ping(current_time)

    if os.path.exists(memory_path):
        with open(memory_path, "r", encoding="utf-8") as file:
            h = json.load(file)
    else:
        agent_data = agent_store.load_agent_data(agent)

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

    messages_to_send = prepare_messages(h, current_time)

    r = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages_to_send,
        extra_body={"options": {"temperature": 0.7, "repeat_penalty": 1.15}},
    )

    ai = r.choices[0].message.content
    ai = strip_translation_noise(ai)

    if not ai:
        ai = "*Looks at you silently...*"

    h.append(
        {
            "role": "assistant",
            "content": ai,
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        }
    )

    with open(memory_path, "w", encoding="utf-8") as file:
        json.dump(h, file, indent=2, ensure_ascii=False)

    return ai, [m for m in h if m["role"] != "system"]


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        d = request.json

        agent_name = d.get("agent", "Makise_Kurisu")
        reply, history = get_logic(
            agent_name,
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
            out_path = os.path.join(AUDIO_DIR, f_name)

            if sovits_gen(" " + v_text, out_path):
                audio_url = f"http://127.0.0.1:5000/audio/{f_name}"

        emotions = agent_store.load_emotions(agent_name)
        poses = agent_store.load_poses(agent_name)
        scene_visual = choose_scene_visual(reply, poses, emotions)

        return jsonify(
            {
                "reply": reply,
                "history": history,
                "audio_url": audio_url,
                "emotion": emotion,
                "scene_visual": scene_visual,
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
        except Exception:
            pass

        if not ut:
            return jsonify({"error": "No audio"}), 400

        reply, history = get_logic(agent, ut)
        reply = ultra_clean_text(reply)
        emotion = detect_emotion(reply)
        audio_url = None

        if v_enabled and is_port_open(9880):
            v_text = clean_for_voice(reply)
            msg_id = uuid.uuid4().hex
            f_name = f"vres_{msg_id}.wav"
            out_path = os.path.join(AUDIO_DIR, f_name)

            if sovits_gen(" " + v_text, out_path):
                audio_url = f"http://127.0.0.1:5000/audio/{f_name}"

        emotions = agent_store.load_emotions(agent)
        poses = agent_store.load_poses(agent)
        scene_visual = choose_scene_visual(reply, poses, emotions)

        return jsonify(
            {
                "user_text": ut,
                "reply": reply,
                "history": history,
                "audio_url": audio_url,
                "emotion": emotion,
                "scene_visual": scene_visual,
            }
        )
    except Exception as e:
        print(f"Voice Chat Error: {e}")
        return jsonify({"reply": "*Error*", "emotion": "sad"})


@app.route("/api/history")
def history():
    agent = request.args.get("agent", "Makise_Kurisu")
    memory_path = get_memory_path(agent)

    if os.path.exists(memory_path):
        with open(memory_path, "r", encoding="utf-8") as f:
            return jsonify(
                {"history": [m for m in json.load(f) if m["role"] != "system"]}
            )

    return jsonify({"history": []})


@app.route("/api/clear_history", methods=["POST"])
def clear_history():
    agent = request.args.get("agent", "Makise_Kurisu")
    memory_path = get_memory_path(agent)

    if os.path.exists(memory_path):
        os.remove(memory_path)

    return jsonify({"status": "success"})


@app.route("/api/agents/auth", methods=["POST"])
def api_agents_auth():
    if not check_agents_password():
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return jsonify({"ok": True})


@app.route("/api/agents", methods=["GET"])
def api_list_agents():
    if not check_agents_password():
        return jsonify({"error": "Unauthorized"}), 401

    try:
        return jsonify({"agents": agent_store.list_available_agents()})
    except Exception as e:
        print(f"Agents list error: {e}")
        return jsonify({"agents": []}), 500


@app.route("/api/agents/<agent_name>", methods=["GET"])
def api_get_agent(agent_name):
    try:
        data = agent_store.load_agent_data(agent_name)
        if not data:
            return jsonify({"error": "Agent not found"}), 404

        data["emotions"] = agent_store.load_emotions(agent_name)
        data["poses"] = agent_store.load_poses(agent_name)
        return jsonify(data)
    except Exception as e:
        print(f"Agent get error: {e}")
        return jsonify({"error": "Failed to load agent"}), 500


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
        agent_dir = agent_store.get_agent_dir(agent_name)

        if os.path.exists(agent_dir):
            return jsonify({"error": "An agent with this name already exists"}), 400

        agent_store.ensure_agent_dirs(agent_name)

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

        agent_store.save_agent_data(agent_name, agent_data)

        return jsonify({"status": "success", "agent": agent_data})
    except Exception as e:
        print(f"Create agent error: {e}")
        return jsonify({"error": "Failed to create agent"}), 500


@app.route("/audio/<f>")
def serve_audio(f):
    return send_from_directory(AUDIO_DIR, f)


@app.route("/uigrounds/<path:filename>")
def serve_ui(filename):
    return send_from_directory(UIGROUNDS_DIR, filename)


@app.route("/sounds/<path:filename>")
def serve_sounds(filename):
    return send_from_directory(SOUNDS_DIR, filename)


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
