import base64
import io
import json
import os
import traceback
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import numpy as np
from kokoro import KPipeline


HOST = os.environ.get("KOKORO_HOST", "127.0.0.1")
PORT = int(os.environ.get("KOKORO_PORT", "5037"))
DEFAULT_VOICE = os.environ.get("KOKORO_DEFAULT_SPEAKER", "if_sara").strip().lower()
LANG_CODE = os.environ.get("KOKORO_LANG_CODE", "i")
REPO_ID = os.environ.get("KOKORO_REPO_ID", "hexgrad/Kokoro-82M")
SPEED = float(os.environ.get("KOKORO_SPEED", "1.0"))
SAMPLE_RATE = 24000
WARMUP_TEXT = os.environ.get("KOKORO_WARMUP_TEXT", "Ciao.")


class KokoroEngine:
    def __init__(self):
        self.pipeline = None
        self.generate_lock = Lock()
        self.available_voices = sorted(
            {
                DEFAULT_VOICE,
                "if_sara",
                "im_nicola",
            }
        )

    def initialize(self):
        self.pipeline = KPipeline(lang_code=LANG_CODE)
        self.synthesize(WARMUP_TEXT, DEFAULT_VOICE)

    def resolve_voice(self, voice):
        normalized = str(voice or DEFAULT_VOICE).strip().lower()
        if not normalized:
            return DEFAULT_VOICE
        return normalized

    def _chunk_to_numpy(self, audio):
        if hasattr(audio, "detach"):
            return audio.detach().float().cpu().numpy()
        return np.asarray(audio, dtype=np.float32)

    def _to_wav_bytes(self, audio_array):
        pcm = np.int16(np.clip(audio_array, -1.0, 1.0) * 32767.0)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(SAMPLE_RATE)
            wav_file.writeframes(pcm.tobytes())
        return buffer.getvalue()

    def synthesize(self, text, voice):
        clean_text = str(text or "").strip()
        if not clean_text:
            raise RuntimeError("Empty text")

        selected_voice = self.resolve_voice(voice)
        chunks = []
        for _, _, audio in self.pipeline(
            clean_text,
            voice=selected_voice,
            speed=SPEED,
            split_pattern=r"\n+",
        ):
            if audio is None:
                continue
            chunk = self._chunk_to_numpy(audio).reshape(-1)
            if chunk.size:
                chunks.append(chunk)

        if not chunks:
            raise RuntimeError("Kokoro returned no audio")

        merged = np.concatenate(chunks).astype(np.float32)
        wav_bytes = self._to_wav_bytes(merged)
        duration_ms = round((merged.shape[0] / SAMPLE_RATE) * 1000)
        return {
            "speaker_name": selected_voice,
            "sample_rate": SAMPLE_RATE,
            "duration_ms": max(1, duration_ms),
            "audio_base64": base64.b64encode(wav_bytes).decode("ascii"),
        }


engine = KokoroEngine()


def send_json(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class KokoroHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            send_json(self, 404, {"ok": False, "detail": "Not found"})
            return

        send_json(
            self,
            200,
            {
                "ok": True,
                "ready": engine.pipeline is not None,
                "default_speaker": DEFAULT_VOICE,
                "available_voices": engine.available_voices,
                "provider": "kokoro",
            },
        )

    def do_POST(self):
        if self.path != "/synthesize":
            send_json(self, 404, {"ok": False, "detail": "Not found"})
            return

        try:
            raw_length = int(self.headers.get("Content-Length") or "0")
            raw_body = self.rfile.read(raw_length) if raw_length > 0 else b"{}"
            payload = json.loads(raw_body.decode("utf-8"))
            text = payload.get("text")
            voice = payload.get("voice") or payload.get("speaker_name")
            with engine.generate_lock:
                result = engine.synthesize(text, voice)
            send_json(self, 200, {"ok": True, **result})
        except Exception as error:
            send_json(
                self,
                500,
                {
                    "ok": False,
                    "detail": f"{error}\n{traceback.format_exc(limit=3)}",
                },
            )

    def log_message(self, _format, *args):
        return


def main():
    engine.initialize()
    server = ThreadingHTTPServer((HOST, PORT), KokoroHandler)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
