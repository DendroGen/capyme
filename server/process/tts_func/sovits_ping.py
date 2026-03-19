import requests, yaml, os


def sovits_gen(text, output_path):
    try:
        config_path = os.path.join(os.getcwd(), "agents_config.yaml")
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)["sovits_ping_config"]

        url = "http://127.0.0.1:9880"
        params = {
            "text": text,
            "text_lang": cfg["text_lang"].lower(),
            "ref_audio_path": cfg["ref_audio_path"].replace("\\", "/"),
            "prompt_text": cfg["prompt_text"],
            "prompt_lang": cfg["prompt_lang"].lower(),
            "top_k": 15,
            "top_p": 1.0,
            "temperature": 0.5,
            # BÜTÜN İŞİ MOTOR YAPACAK: Noktalamaya göre böler ve hatasız birleştirir
            "text_split_method": "cut2",
            "batch_size": 1,
            "speed_factor": 1.0,
            "fragment_interval": 0.3,
        }

        try:
            # Bekleme süresini artırdık ki motor uzun metinleri işlerken Timeout yemesin
            r = requests.get(f"{url}/tts", params=params, timeout=120)
            if r.status_code == 200 and len(r.content) > 1000:
                with open(output_path, "wb") as f:
                    f.write(r.content)
                return True
        except Exception as e:
            print(f"TTS Istek Hatasi: {e}")

        return False
    except Exception as e:
        print(f"TTS Genel Hata: {e}")
        return False
