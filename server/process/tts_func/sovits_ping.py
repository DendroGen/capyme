import requests
import time
import soundfile as sf
import sounddevice as sd
import yaml
import os

# Load YAML config
with open("character_config.yaml", "r", encoding="utf-8") as f:
    char_config = yaml.safe_load(f)


def play_audio(path):
    if path is None or not os.path.exists(path):
        print("Audio file not found.")
        return

    data, samplerate = sf.read(path)
    sd.play(data, samplerate)
    sd.wait()


def sovits_gen(in_text, output_wav_pth="output.wav"):
    url = "http://127.0.0.1:9880/tts"

    payload = {
        "text": in_text,
        "text_lang": char_config["sovits_ping_config"]["text_lang"],
        "ref_audio_path": char_config["sovits_ping_config"]["ref_audio_path"],
        "prompt_text": char_config["sovits_ping_config"]["prompt_text"],
        "prompt_lang": char_config["sovits_ping_config"]["prompt_lang"],
        "text_split_method": "cut5",
        "batch_size": 1,
        "speed_factor": 1.0,
    }

    try:
        response = requests.post(url, json=payload, timeout=120)

        print("Status:", response.status_code)

        if response.status_code != 200:
            print("Server response:", response.text)
            return None

        with open(output_wav_pth, "wb") as f:
            f.write(response.content)

        return output_wav_pth

    except Exception as e:
        print("Error in sovits_gen:", e)
        return None


if __name__ == "__main__":
    start_time = time.time()

    wav_path = sovits_gen(
        "If you hear this, the SoVITS server is working correctly", "output.wav"
    )

    if wav_path:
        play_audio(wav_path)

    end_time = time.time()

    print(f"Elapsed time: {end_time - start_time:.2f} seconds")
