import json
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional


def safe_agent_folder_name(name: str) -> str:
    if not name:
        return "Unnamed_Agent"

    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = re.sub(r"[^\w\s-]", "", name).strip()
    name = re.sub(r"[-\s]+", "_", name)
    return name or "Unnamed_Agent"


class AgentStore:
    def __init__(self, uigrounds_dir: str):
        self.uigrounds_dir = uigrounds_dir
        os.makedirs(self.uigrounds_dir, exist_ok=True)

    def get_agent_dir(self, agent_name: str) -> str:
        return os.path.join(self.uigrounds_dir, agent_name)

    def get_agent_json_path(self, agent_name: str) -> str:
        return os.path.join(self.get_agent_dir(agent_name), "agent.json")

    def get_emotions_dir(self, agent_name: str) -> str:
        return os.path.join(self.get_agent_dir(agent_name), "emotions")

    def get_poses_dir(self, agent_name: str) -> str:
        return os.path.join(self.get_agent_dir(agent_name), "poses")

    def ensure_agent_dirs(self, agent_name: str) -> None:
        agent_dir = self.get_agent_dir(agent_name)
        os.makedirs(agent_dir, exist_ok=True)
        os.makedirs(self.get_emotions_dir(agent_name), exist_ok=True)
        os.makedirs(self.get_poses_dir(agent_name), exist_ok=True)

    def load_agent_data(self, agent_name: str) -> Optional[Dict[str, Any]]:
        agent_json = self.get_agent_json_path(agent_name)
        if os.path.exists(agent_json):
            with open(agent_json, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

    def save_agent_data(self, agent_name: str, data: Dict[str, Any]) -> None:
        self.ensure_agent_dirs(agent_name)
        with open(self.get_agent_json_path(agent_name), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def _find_profile_url(self, agent_name: str) -> Optional[str]:
        agent_dir = self.get_agent_dir(agent_name)
        for ext in ["jpg", "png", "jpeg", "webp"]:
            profile_path = os.path.join(agent_dir, f"profile.{ext}")
            if os.path.exists(profile_path):
                return f"http://127.0.0.1:5000/uigrounds/{agent_name}/profile.{ext}"
        return None

    def _find_background_url(self, agent_name: str) -> Optional[str]:
        agent_dir = self.get_agent_dir(agent_name)
        for ext in ["jpg", "png", "jpeg", "webp"]:
            bg_path = os.path.join(agent_dir, f"background.{ext}")
            if os.path.exists(bg_path):
                return f"http://127.0.0.1:5000/uigrounds/{agent_name}/background.{ext}"
        return None

    def _load_visual_items(
        self, folder_path: str, base_url: str
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not os.path.exists(folder_path):
            return results

        for item in os.listdir(folder_path):
            item_path = os.path.join(folder_path, item)
            if not os.path.isfile(item_path):
                continue

            stem, ext = os.path.splitext(item)
            ext = ext.lower()

            if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
                continue

            meta_path = os.path.join(folder_path, f"{stem}.json")
            meta: Dict[str, Any] = {
                "key": stem,
                "label": stem,
                "description": "",
                "triggers": [],
                "priority": 1,
                "image_url": f"{base_url}/{item}",
            }

            if os.path.exists(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                    meta.update(loaded)
                    meta["image_url"] = f"{base_url}/{item}"
                except Exception:
                    pass

            results.append(meta)

        return sorted(results, key=lambda x: int(x.get("priority", 1)), reverse=True)

    def list_available_agents(self) -> List[Dict[str, Any]]:
        agents: List[Dict[str, Any]] = []

        if not os.path.exists(self.uigrounds_dir):
            return agents

        for item in os.listdir(self.uigrounds_dir):
            agent_dir = os.path.join(self.uigrounds_dir, item)
            if not os.path.isdir(agent_dir):
                continue

            agent_json = os.path.join(agent_dir, "agent.json")
            if not os.path.exists(agent_json):
                continue

            try:
                with open(agent_json, "r", encoding="utf-8") as f:
                    data = json.load(f)

                agents.append(
                    {
                        "name": data.get("name", item),
                        "display_name": data.get(
                            "display_name", item.replace("_", " ")
                        ),
                        "age": data.get("age", ""),
                        "personality": data.get("personality", ""),
                        "backstory": data.get("backstory", ""),
                        "first_meeting": data.get("first_meeting", ""),
                        "theme": data.get("theme", {}),
                        "profile_url": self._find_profile_url(item),
                        "background_url": self._find_background_url(item),
                    }
                )
            except Exception as e:
                print(f"Agent load error ({item}): {e}")

        agents.sort(key=lambda x: x["display_name"].lower())
        return agents

    def load_emotions(self, agent_name: str) -> List[Dict[str, Any]]:
        folder = self.get_emotions_dir(agent_name)
        base_url = f"http://127.0.0.1:5000/uigrounds/{agent_name}/emotions"
        return self._load_visual_items(folder, base_url)

    def load_poses(self, agent_name: str) -> List[Dict[str, Any]]:
        folder = self.get_poses_dir(agent_name)
        base_url = f"http://127.0.0.1:5000/uigrounds/{agent_name}/poses"
        return self._load_visual_items(folder, base_url)


@staticmethod
def save_visual_image(agent, category, filename, file):
    base = os.path.join("uigrounds", agent, category)
    os.makedirs(base, exist_ok=True)

    path = os.path.join(base, filename)
    file.save(path)

    return f"http://127.0.0.1:5000/uigrounds/{agent}/{category}/{filename}"


@staticmethod
def add_emotion(agent, emotion):
    data = AgentStore.load_agent(agent)
    data.setdefault("emotions", []).append(emotion)
    AgentStore.save_agent(agent, data)


@staticmethod
def add_pose(agent, pose):
    data = AgentStore.load_agent(agent)
    data.setdefault("poses", []).append(pose)
    AgentStore.save_agent(agent, data)
