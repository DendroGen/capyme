import requests, yaml, os


def sovits_gen(text, output_path):
    try:
        config_path = os.path.join(os.getcwd(), "character_config.yaml")
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)["sovits_ping_config"]

        url = "http://127.0.0.1:9880"

        params = {
            "text": text,
            "text_lang": cfg["text_lang"].lower(),
            "ref_audio_path": cfg["ref_audio_path"].replace("\\", "/"),
            "prompt_text": cfg["prompt_text"],
            "prompt_lang": cfg["prompt_lang"].lower(),
            # ---Hallüsinasyon Engelleyici Parametreler ---
            "top_k": 1,  # En düşük değer: Motor sadece en net sese odaklanır
            "top_p": 1,
            "temperature": 0.1,  # En düşük yaratıcılık: "Teeee" sesini %99 keser
            "text_split_method": "cut2",  # Noktaya göre kesin bölme
            "batch_size": 1,
            "speed_factor": 1.0,
            "fragment_interval": 0.3,
        }

        # API Denemesi
        try:
            r = requests.get(f"{url}/tts", params=params, timeout=40)
            if r.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(r.content)
                return True
        except:
            pass

        r = requests.get(url, params=params, timeout=40)
        if r.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(r.content)
            return True

        return False
    except Exception as e:
        print(f"TTS Error: {e}")
        return False
