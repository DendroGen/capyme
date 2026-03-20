import json
import os
from typing import Any, Dict, List


def load_history_file(path: str) -> List[Dict[str, Any]]:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history_file(path: str, history: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


def get_visible_history(history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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
    history: List[Dict[str, Any]], visible_index: int, new_content: str
) -> List[Dict[str, Any]]:
    real_index = visible_index_to_real_index(history, visible_index)

    if history[real_index].get("role") != "user":
        raise ValueError("Only user messages can be edited")

    history[real_index]["content"] = new_content
    return history[: real_index + 1]
