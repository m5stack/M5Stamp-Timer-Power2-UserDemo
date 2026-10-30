#!/usr/bin/env python3
"""Serve the offline device Web UI locally and optionally mock its API."""
from __future__ import annotations

import argparse
import importlib.util
import json
import mimetypes
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def load_mock(path: Path | None):
    if path is None or not path.is_file():
        return None
    spec = importlib.util.spec_from_file_location("stp2_mock_api", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def make_handler(web_root: Path, mock, api_delay: float):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, content_type: str, body: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _api(self, method: str) -> bool:
            url = urlsplit(self.path)
            if not url.path.startswith("/api/") or mock is None:
                return False
            form = {key: values[-1] for key, values in parse_qs(url.query).items()}
            if method == "POST":
                length = int(self.headers.get("Content-Length") or 0)
                if length:
                    body = self.rfile.read(length).decode("utf-8", errors="replace")
                    form.update({key: values[-1] for key, values in parse_qs(body).items()})
            if api_delay > 0:
                time.sleep(api_delay)
            result = mock.handle(method, url.path, form)
            if result is None:
                self._send(404, "application/json; charset=utf-8", b'{"message":"Not found"}')
            else:
                status, payload = result
                data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self._send(status, "application/json; charset=utf-8", data)
            return True

        def _static(self) -> None:
            rel = urlsplit(self.path).path.lstrip("/") or "index.html"
            target = (web_root / rel).resolve()
            try:
                target.relative_to(web_root)
            except ValueError:
                self._send(404, "text/plain; charset=utf-8", b"Not found")
                return
            if not target.is_file():
                target = web_root / "index.html"
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(200, content_type, target.read_bytes())

        def do_GET(self) -> None:
            if not self._api("GET"):
                self._static()

        def do_HEAD(self) -> None:
            if not self._api("HEAD"):
                self._static()

        def do_POST(self) -> None:
            if not self._api("POST"):
                self._send(404, "application/json; charset=utf-8", b'{"message":"Not found"}')

        def log_message(self, fmt: str, *args) -> None:
            if args and str(args[1]).startswith(("4", "5")):
                super().log_message(fmt, *args)

    return Handler


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", type=Path, default=Path("esp_web"))
    parser.add_argument("--mock", type=Path, default=Path("mock_api.py"))
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--delay", type=float, default=0.04, help="Artificial API latency in seconds")
    args = parser.parse_args()

    web_root = args.web.resolve()
    if not web_root.is_dir():
        parser.error(f"web directory not found: {web_root}")
    mock = load_mock(args.mock.resolve())
    print(f"Serving {web_root} at http://{args.host}:{args.port}/ (mock={'on' if mock else 'off'})")
    ThreadingHTTPServer((args.host, args.port), make_handler(web_root, mock, args.delay)).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
