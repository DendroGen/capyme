from typing import Any, Dict, List, Optional


def _score_item(reply_text: str, item: Dict[str, Any]) -> int:
    text = (reply_text or "").lower()
    score = 0

    triggers = item.get("triggers", []) or []
    description = (item.get("description", "") or "").lower()

    for trig in triggers:
        trig_l = str(trig).lower().strip()
        if trig_l and trig_l in text:
            score += 4

    if description:
        desc_words = [w.strip() for w in description.split() if len(w.strip()) > 4]
        matched = 0
        for w in desc_words[:8]:
            if w.lower() in text:
                matched += 1
        score += matched

    score += int(item.get("priority", 1))
    return score


def choose_best_visual(
    reply_text: str, items: List[Dict[str, Any]], min_score: int = 5
) -> Optional[Dict[str, Any]]:
    best = None
    best_score = -1

    for item in items:
        score = _score_item(reply_text, item)
        if score > best_score:
            best_score = score
            best = item

    if best and best_score >= min_score:
        return best
    return None


def choose_scene_visual(
    reply_text: str, poses: List[Dict[str, Any]], emotions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Önce pose dene. Yeterince güçlü eşleşme yoksa emotion dene.
    Hiçbiri yoksa boş dön.
    """
    pose = choose_best_visual(reply_text, poses, min_score=6)
    if pose:
        return {
            "type": "pose",
            "key": pose.get("key"),
            "label": pose.get("label"),
            "image_url": pose.get("image_url"),
            "description": pose.get("description", ""),
        }

    emotion = choose_best_visual(reply_text, emotions, min_score=5)
    if emotion:
        return {
            "type": "emotion",
            "key": emotion.get("key"),
            "label": emotion.get("label"),
            "image_url": emotion.get("image_url"),
            "description": emotion.get("description", ""),
        }

    return {
        "type": None,
        "key": None,
        "label": None,
        "image_url": None,
        "description": "",
    }
