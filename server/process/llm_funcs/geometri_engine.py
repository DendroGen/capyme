# geometry_engine.py içine bunu koy
import requests
import base64


class GeometryLLM:
    def __init__(self, model="qwen3-vl:8b"):
        self.model = model
        self.url = "http://localhost:11434/api/generate"

    def process_page(self, img_path, prompt_ext=""):
        with open(img_path, "rb") as f:
            img_data = base64.b64encode(f.read()).decode("utf-8")

        payload = {
            "model": self.model,
            "prompt": f"Bu bir geometri sayfasıdır. {prompt_ext} Detaylıca açıkla.",
            "images": [img_data],
            "stream": False,
        }
        return requests.post(self.url, json=payload).json().get("response", "")
