
import sys, json, traceback, contextlib, inspect
def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()
try:
    from kittenml import KittenTTS
except Exception as e:
    out({"ready": False, "error": "kittenml import failed: " + str(e)})
    sys.exit(2)
repo = sys.argv[1] if len(sys.argv) > 1 else "KittenML/kitten-tts-nano-0.8-int8"
cache = sys.argv[2] if len(sys.argv) > 2 else None
try:
    # Downloads are a local repository, not a Hugging Face cache layout.
    # Keep model logs off the JSON protocol stream.
    with contextlib.redirect_stdout(sys.stderr):
        model = KittenTTS(cache or repo, weights="emb4") if repo.endswith("kitten-tts-2") else KittenTTS(cache or repo)
    try:
        voices = list(model.available_voices or [])
    except Exception:
        voices = []
    out({"ready": True, "voices": voices, "sample_rate": getattr(model, "sample_rate", 24000)})
except Exception as e:
    out({"ready": False, "error": str(e)})
    sys.exit(3)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
    except Exception:
        continue
    if req.get("cmd") == "voices":
        try:
            out({"id": req.get("id"), "ok": True, "voices": list(model.available_voices or [])})
        except Exception as e:
            out({"id": req.get("id"), "ok": False, "error": str(e)})
        continue
    if req.get("cmd") != "synth":
        continue
    try:
        text = str(req.get("text") or "")[:1200]
        voice = str(req.get("voice") or "Luna")
        speed = float(req.get("speed") or 1.0)
        dest = str(req.get("out") or "")
        if not text or not dest:
            out({"id": req.get("id"), "ok": False, "error": "empty text/out"})
            continue
        try:
            import soundfile as sf
            kwargs = {"voice": voice}
            if "speed" in inspect.signature(model.generate).parameters:
                kwargs["speed"] = speed
            with contextlib.redirect_stdout(sys.stderr):
                audio = model.generate(text, **kwargs)
            sf.write(dest, audio, getattr(model, "sample_rate", 24000))
        except ImportError as e:
            raise RuntimeError("Install soundfile for WAV output: " + str(e))
        out({"id": req.get("id"), "ok": True, "file": dest})
    except Exception as e:
        out({"id": req.get("id"), "ok": False, "error": str(e) + " " + traceback.format_exc(limit=3)})
