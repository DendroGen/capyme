import requests
import yaml
import os


def sovits_gen(text, output_path):
    try:
        # Config dosyasını kök dizinden oku
        config_path = os.path.join(os.getcwd(), "character_config.yaml")
        with open(config_path, "r", encoding="utf-8") as f:
            full_cfg = yaml.safe_load(f)
            cfg = full_cfg["sovits_ping_config"]

        url = "http://127.0.0.1:9880"

        # Parametreleri senin API'nin istediği standart GET formatına sokuyoruz
        params = {
            "text": text,
            "text_lang": cfg["text_lang"].lower(),
            "ref_audio_path": cfg["ref_audio_path"],
            "prompt_text": cfg["prompt_text"],
            "prompt_lang": cfg["prompt_lang"].lower(),
        }

        print(f"--- [AMADEUS] Kurisu is synthesizing speech... ---")

        # Kesinlikle GET kullanıyoruz (Senin terminal POST'a 404 veriyor)
        response = requests.get(url, params=params, timeout=60)

        if response.status_code == 200:
            with open(output_path, "wb") as f:
                f.write(response.content)
            print(f"--- [AMADEUS] Voice generated! -> {output_path} ---")
            return True
        else:
            # Bazı versiyonlar root (/) yerine /tts bekleyebilir, 404 alırsak onu deneyelim
            if response.status_code == 404:
                print("--- [AMADEUS] Root failed, trying /tts endpoint... ---")
                response = requests.get(f"{url}/tts", params=params, timeout=60)
                if response.status_code == 200:
                    with open(output_path, "wb") as f:
                        f.write(response.content)
                    return True

            print(f"--- [GSV2 ERROR] Code: {response.status_code} ---")
            return False

    except Exception as e:
        print(f"--- [BRIDGE FAILURE] {e} ---")
        return False
