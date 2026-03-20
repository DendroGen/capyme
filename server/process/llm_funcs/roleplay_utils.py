import re
from typing import Dict, List, Tuple


def ultra_clean_text(text: str) -> str:
    if not text:
        return ""
    return text.strip()


def clean_for_voice(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\*.*?\*", " ", text, flags=re.DOTALL)
    text = re.sub(r"[^\w\s\.\,\!\?çğıöşüÇĞIÖŞÜ]", " ", text)
    return text.lower().strip()


def detect_emotion(text: str) -> str:
    text = text.lower()

    if any(
        word in text
        for word in ["baka", "shut up", "stupid", "christina", "idiot", "dummy"]
    ):
        return "angry_shout"

    if any(
        word in text
        for word in [
            "cute",
            "blush",
            "pervert",
            "embarrassing",
            "looks away",
            "flustered",
        ]
    ):
        return "shy_overheat"

    if any(
        word in text
        for word in ["theory", "calculate", "science", "geometry", "analyze"]
    ):
        return "thinking"

    return "shy_mild"


def build_roleplay_rules(now_hhmm: str) -> str:
    return (
        "\n\n[ROLEPLAY ENGINE:"
        "Stay in the scene."
        "Do not repeat backstory."
        "Do not introduce yourself again unless explicitly asked."
        "Use both actions and dialogue."
        "Each reply MUST include at least 2 actions."
        "Each reply should be 2-4 sentences."
        "Move the scene forward logically."
        "React directly to the user's last message."
        "Do not stall or freeze."
        "No emojis."
        f" Current time: {now_hhmm}."
        "]"
    )


def strip_translation_noise(ai: str) -> str:
    if not ai:
        return ai
    ai = re.sub(r"\s*\(Translation:.*?\)", "", ai, flags=re.IGNORECASE)
    ai = re.sub(r"\s*\[Translation:.*?\]", "", ai, flags=re.IGNORECASE)
    return ai.strip()


def build_idle_ping(current_time: str) -> str:
    return (
        "[SYSTEM: The user hasn't typed anything for exactly 1 hour. "
        f"Current time is {current_time}. "
        "Send a short message staying in character.]"
    )


def prepare_messages(history: List[Dict], now_hhmm: str) -> List[Dict[str, str]]:
    messages_to_send = [{"role": m["role"], "content": m["content"]} for m in history]
    if messages_to_send and messages_to_send[0]["role"] == "system":
        messages_to_send[0]["content"] += build_roleplay_rules(now_hhmm)
    return messages_to_send
