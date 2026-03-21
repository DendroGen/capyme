import json
import os
from typing import Any, Dict, List


def ensure_parent_dir(file_path: str) -> None:
    parent = os.path.dirname(file_path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def load_history_file(file_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(file_path):
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, list):
            return data

        return []
    except Exception:
        return []


def save_history_file(file_path: str, history: List[Dict[str, Any]]) -> None:
    ensure_parent_dir(file_path)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


def visible_history(history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [m for m in history if m.get("role") != "system"]


def visible_index_to_real_index(
    history: List[Dict[str, Any]], visible_index: int
) -> int:
    visible_counter = -1

    for real_index, item in enumerate(history):
        if item.get("role") == "system":
            continue

        visible_counter += 1
        if visible_counter == visible_index:
            return real_index

    raise IndexError("Visible history index out of range")


def edit_user_message_and_truncate(
    history: List[Dict[str, Any]],
    visible_index: int,
    new_content: str,
) -> List[Dict[str, Any]]:
    real_index = visible_index_to_real_index(history, visible_index)

    if history[real_index].get("role") != "user":
        raise ValueError("Only user messages can be edited")

    history[real_index]["content"] = new_content
    return history[: real_index + 1]


def append_message(
    history: List[Dict[str, Any]],
    role: str,
    content: str,
    timestamp: str,
) -> List[Dict[str, Any]]:
    history.append(
        {
            "role": role,
            "content": content,
            "timestamp": timestamp,
        }
    )
    return history


def ensure_system_message(
    history: List[Dict[str, Any]], system_prompt: str
) -> List[Dict[str, Any]]:
    if history and history[0].get("role") == "system":
        return history

    return [{"role": "system", "content": system_prompt.strip()}] + history
