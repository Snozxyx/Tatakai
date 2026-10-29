"""Headless persistent inference and resumable model acquisition; no Qt."""
import argparse
import gc
import json
import math
import queue
import sys
import threading
from pathlib import Path
import urllib.error
import urllib.request
import zipfile

MODELS = {
    "realesrgan": ("RealESRGAN_x4plus_anime_6B.pth", "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"),
    "manga": ("4x_MangaJaNai_1200p_V1_ESRGAN_70k.pth", "https://huggingface.co/Asif782/upscaler_models/resolve/main/bwmodels.zip"),
}
_print_lock = threading.Lock()


def emit(event):
    with _print_lock:
        print(json.dumps(event), flush=True)


def download(engine, directory):
    name, url = MODELS[engine]
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / name
    temp = directory / (name + ".download")
    metadata = directory / (name + ".download.json")
    try:
        old = json.loads(metadata.read_text()) if metadata.exists() else {}
    except (ValueError, OSError):
        old = {}
    offset = temp.stat().st_size if temp.exists() and old.get("validator") else 0
    headers = {"User-Agent": "Tatakai-Upscaler/2"}
    if offset:
        headers.update({"Range": f"bytes={offset}-", "If-Range": old["validator"]})
    try:
        response = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)
    except urllib.error.HTTPError as error:
        if error.code != 416:
            raise
        total = error.headers.get("Content-Range", "").split("/")[-1]
        if not offset or not total.isdigit() or int(total) != offset:
            temp.unlink(missing_ok=True)
            metadata.unlink(missing_ok=True)
            return download(engine, directory)
        response = None
    if response:
        with response:
            resumed = response.status == 206 and offset > 0
            if resumed and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
                raise ValueError("Invalid model resume range. Try setup again.")
            if not resumed:
                offset = 0
            total = int(response.headers.get("Content-Length", 0)) + offset
            metadata.write_text(json.dumps({"validator": response.headers.get("ETag") or response.headers.get("Last-Modified")}))
            with temp.open("ab" if resumed else "wb") as dest:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    dest.write(chunk)
                    offset += len(chunk)
                    if offset > 2 * 1024 ** 3:
                        raise ValueError("Model download exceeds 2 GB")
                    emit({"type": "download", "bytes": offset, "total": total})
            if total and offset != total:
                raise ValueError("Download interrupted. Choose Set up to resume.")
    extracted = target.with_suffix(target.suffix + ".extracting")
    try:
        if engine == "manga":
            with zipfile.ZipFile(temp) as archive:
                entry = next(info for info in archive.infolist() if Path(info.filename).name == name)
                if entry.file_size > 512 * 1024 ** 2:
                    raise ValueError("Model is too large")
                with archive.open(entry) as source, extracted.open("wb") as dest:
                    import shutil
                    shutil.copyfileobj(source, dest)
            extracted.replace(target)
            temp.unlink()
        else:
            temp.replace(target)
        metadata.unlink(missing_ok=True)
    finally:
        extracted.unlink(missing_ok=True)


class Inference:
    def __init__(self, models):
        self.models, self.model, self.engine = models, None, None

    def load(self, engine):
        import torch
        from spandrel import ModelLoader, ImageModelDescriptor
        if self.engine == engine and self.model is not None:
            return self.model
        self.model, self.engine = None, None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        model = ModelLoader().load_from_file(str(self.models / MODELS[engine][0]))
        if not isinstance(model, ImageModelDescriptor):
            raise ValueError("This model does not support image upscaling")
        self.model = model.to(torch.device("cuda" if torch.cuda.is_available() else "cpu")).eval()
        self.engine = engine
        return self.model

    def enhance(self, job, cancelled):
        import numpy as np
        import torch
        from PIL import Image, ImageOps
        def check():
            if cancelled.is_set():
                raise InterruptedError("Enhancement cancelled")
        check()
        image = Image.open(job["input"])
        if image.width * image.height > 8_000_000:
            raise ValueError("Page exceeds 8 megapixels. The original is still available.")
        image = ImageOps.exif_transpose(image).convert("RGB")
        model = self.load(job["engine"])
        check()
        width, height = image.size
        factor = model.scale
        output = Image.new("RGB", (width * factor, height * factor))
        tile, padding = {"light": (128, 16), "balanced": (192, 24), "high": (192, 40)}[job.get("quality", "balanced")]
        total = math.ceil(height / tile) * math.ceil(width / tile)
        completed = 0
        with torch.inference_mode():
            for top in range(0, height, tile):
                for left in range(0, width, tile):
                    check()
                    right, bottom = min(width, left + tile), min(height, top + tile)
                    x, y = max(0, left - padding), max(0, top - padding)
                    patch = image.crop((x, y, min(width, right + padding), min(height, bottom + padding)))
                    data = torch.from_numpy(np.array(patch).astype(np.float32) / 255).permute(2, 0, 1).unsqueeze(0).to(model.device)
                    ph, pw = data.shape[-2:]
                    pad_w, pad_h = model.size_requirements.get_padding(pw, ph)
                    data = torch.nn.functional.pad(data, (0, pad_w, 0, pad_h), mode="replicate")
                    result = model(data).clamp(0, 1).squeeze(0).permute(1, 2, 0).cpu().numpy()
                    result = Image.fromarray((result * 255).round().astype(np.uint8))
                    output.paste(result.crop(((left - x) * factor, (top - y) * factor, (right - x) * factor, (bottom - y) * factor)), (left * factor, top * factor))
                    completed += 1
                    emit({"type": "progress", "id": job["id"], "progress": round(completed * 100 / total)})
        check()
        if job["scale"] != factor:
            output = output.resize((width * job["scale"], height * job["scale"]), Image.Resampling.LANCZOS)
        output.save(job["output"], "PNG")
        check()


def serve(models):
    inference, jobs, signals = Inference(models), queue.Queue(), {}
    def execute():
        while True:
            job = jobs.get()
            if job is None:
                return
            try:
                if job.get("command") == "verify":
                    inference.load(job["engine"])
                else:
                    inference.enhance(job, signals[job["id"]])
                emit({"type": "result", "id": job["id"], "engine": inference.engine})
            except Exception as error:
                emit({"type": "error", "id": job["id"], "message": str(error)})
            finally:
                signals.pop(job["id"], None)
    threading.Thread(target=execute, daemon=True).start()
    emit({"type": "ready"})
    for line in sys.stdin:
        job = {}
        try:
            job = json.loads(line)
            if job.get("command") == "cancel":
                if job["id"] in signals:
                    signals[job["id"]].set()
            else:
                if job["engine"] not in MODELS or job.get("scale", 2) not in (2, 4):
                    raise ValueError("Invalid inference settings")
                signals[job["id"]] = threading.Event()
                jobs.put(job)
        except Exception as error:
            emit({"type": "error", "id": job.get("id"), "message": str(error)})
    jobs.put(None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=MODELS)
    parser.add_argument("--models", required=True)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()
    if args.download:
        download(args.engine, Path(args.models))
    elif args.serve:
        serve(Path(args.models))
