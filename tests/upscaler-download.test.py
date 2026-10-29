"""No torch needed: exercise real HTTP range handling and archive extraction."""
import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import io
import zipfile

spec = importlib.util.spec_from_file_location("worker", Path(__file__).resolve().parent.parent / "desktop/runtime/upscaler/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class Downloads(unittest.TestCase):
    def check_download(self, ignore_range=False, archive=False):
        content = b"official-model-fixture-bytes" * 100
        model_name = "fixture.pth"
        if archive:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as zipped:
                zipped.writestr("../../fixture.pth", content)
                zipped.writestr("../../unrelated.txt", "must not be extracted")
            payload = buffer.getvalue()
        else:
            payload = content
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                start = 0 if ignore_range else int(self.headers.get("Range", "bytes=0-").split("=")[1].split("-")[0])
                requests.append(dict(self.headers))
                self.send_response(206 if start else 200)
                self.send_header("Content-Length", str(len(payload) - start))
                self.send_header("ETag", '"fixture"')
                if start:
                    self.send_header("Content-Range", f"bytes {start}-{len(payload)-1}/{len(payload)}")
                self.end_headers()
                self.wfile.write(payload[start:])
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / (model_name + ".download")).write_bytes(payload[:9])
                (root / (model_name + ".download.json")).write_text(json.dumps({"validator": '"fixture"'}))
                engine = "manga" if archive else "realesrgan"
                with patch.dict(worker.MODELS, {engine: (model_name, f"http://127.0.0.1:{server.server_port}/model")}), patch.object(worker, "emit"):
                    worker.download(engine, root)
                self.assertEqual((root / model_name).read_bytes(), content)
                self.assertEqual(requests[0]["Range"], "bytes=9-")
                self.assertEqual(requests[0]["If-Range"], '"fixture"')
                self.assertFalse((root.parent / "unrelated.txt").exists())
                self.assertFalse((root / (model_name + ".download")).exists())
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_resumes_using_range_and_validator(self):
        self.check_download()

    def test_restarts_when_server_ignores_range(self):
        self.check_download(ignore_range=True)

    def test_extracts_only_selected_weight_without_trusting_archive_paths(self):
        self.check_download(archive=True)


if __name__ == "__main__":
    unittest.main()
