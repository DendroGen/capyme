import json
import os
import re
from typing import Any, Dict, List, Optional


def _normalize_text(text: str) -> str:
    return (text or "").strip().lower()


def _split_tags(tag_text: str) -> List[str]:
    if not tag_text:
        return []
    parts = re.split(r"[,;/\n]+", tag_text)
    return [p.strip().lower() for p in parts if p.strip()]


def _safe_load_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _score_item(message_text: str, item: Dict[str, Any]) -> int:
    score = 0

    tags = _split_tags(item.get("tags", ""))
    label = _normalize_text(item.get("label", ""))
    description = _normalize_text(item.get("description", ""))

    for tag in tags:
        if tag and tag in message_text:
            score += 4

    if label and label in message_text:
        score += 5

    label_words = [w for w in re.findall(r"\w+", label) if len(w) > 2]
    for word in label_words:
        if word in message_text:
            score += 2

    desc_words = [w for w in re.findall(r"\w+", description) if len(w) > 3]
    for word in desc_words[:20]:
        if word in message_text:
            score += 1

    return score


def _build_asset_url(agent_name: str, relative_path: str) -> str:
    relative_path = relative_path.replace("\\", "/").lstrip("/")
    return f"http://127.0.0.1:5000/uigrounds/{agent_name}/{relative_path}"


def _pick_best_item(
    message_text: str, items: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    best_item = None
    best_score = 0

    for item in items:
        item_score = _score_item(message_text, item)
        if item_score > best_score:
            best_score = item_score
            best_item = item

    return best_item


def choose_scene_visual(
    agent_dir: str, agent_name: str, ai_text: str
) -> Dict[str, Any]:
    """
    Returns:
    {
      "pose_url": str | None,
      "emotion_url": str | None,
      "pose": {...} | None,
      "emotion": {...} | None
    }
    """
    agent_json_path = os.path.join(agent_dir, "agent.json")
    data = _safe_load_json(agent_json_path)

    message_text = _normalize_text(ai_text)

    poses = data.get("poses", [])
    emotions = data.get("emotions", [])

    if not isinstance(poses, list):
        poses = []
    if not isinstance(emotions, list):
        emotions = []

    best_pose = _pick_best_item(message_text, poses)
    best_emotion = _pick_best_item(message_text, emotions)

    pose_url = None
    emotion_url = None

    if best_pose and best_pose.get("file"):
        pose_url = _build_asset_url(agent_name, best_pose["file"])

    if best_emotion and best_emotion.get("file"):
        emotion_url = _build_asset_url(agent_name, best_emotion["file"])

    return {
        "pose_url": pose_url,
        "emotion_url": emotion_url,
        "pose": best_pose,
        "emotion": best_emotion,
    }
