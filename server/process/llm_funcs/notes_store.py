import json
import os


class NotesStore:
    def __init__(self, notes_dir: str):
        self.notes_dir = notes_dir
        os.makedirs(self.notes_dir, exist_ok=True)

    def get_user_notes_path(self, key: str = "default"):
        return os.path.join(self.notes_dir, f"{key}.json")

    def load_notes(self, key: str = "default"):
        path = self.get_user_notes_path(key)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"notes": []}

    def save_notes(self, data, key: str = "default"):
        path = self.get_user_notes_path(key)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
