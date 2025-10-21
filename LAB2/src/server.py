#!/usr/bin/env python3
"""
Lab 2 - Concurrent HTTP File Server

Features:
- Thread pool for handling multiple connections concurrently
- Optional artificial delay to simulate work for benchmarking
- Request counters per-path (naive and locked modes)
- Thread-safe per-IP rate limiting (default ~5 req/s)
- Directory listing shows per-item hit counts
"""

import argparse
import os
import socket
import sys
import threading
import time
import urllib.parse
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime


class HTTPServer:
    def __init__(
        self,
        host: str = "0.0.0.0",
        port: int = 8080,
        directory: str = ".",
        workers: int = 8,
        simulate_delay: float = 0.0,
        counter_mode: str = "locked",  # "naive" or "locked"
        naive_interleave_ms: int = 0,
        rate_limit: int = 5,
        rate_window: float = 1.0,
    ) -> None:
        self.host = host
        self.port = port
        self.directory = os.path.abspath(directory)
        self.workers = max(1, workers)
        self.simulate_delay = max(0.0, simulate_delay)
        self.counter_mode = counter_mode
        self.naive_interleave_ms = max(0, int(naive_interleave_ms))
        self.rate_limit = max(1, int(rate_limit))
        self.rate_window = float(rate_window)

        self.socket = None
        self.executor: ThreadPoolExecutor | None = None

        # Request counters and synchronization
        self.request_counts: dict[str, int] = defaultdict(int)
        self.count_lock = threading.Lock()

        # Rate limiting: per-IP timestamp deque
        self.rate_map: dict[str, deque] = defaultdict(deque)
        self.rate_lock = threading.Lock()

        self.mime_types = {
            ".html": "text/html",
            ".htm": "text/html",
            ".png": "image/png",
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".css": "text/css",
            ".js": "application/javascript",
            ".txt": "text/plain",
        }

    # ---------------------- Concurrency & Lifecycle ---------------------- #
    def start(self) -> None:
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        # Allow quick restarts
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind((self.host, self.port))
        self.socket.listen(128)

        print(f"[LAB2] Concurrent server at http://{self.host}:{self.port}")
        print(f"Serving directory: {self.directory}")
        print(
            f"Workers={self.workers}, delay={self.simulate_delay}s, counter={self.counter_mode}, rate={self.rate_limit}/{self.rate_window}s"
        )
        print("Press Ctrl+C to stop the server")

        self.executor = ThreadPoolExecutor(max_workers=self.workers)
        try:
            while True:
                client_socket, client_addr = self.socket.accept()
                # Submit each connection to the pool
                self.executor.submit(self._handle_connection, client_socket, client_addr)
        except KeyboardInterrupt:
            print("\n[LAB2] Shutting down...")
        finally:
            if self.executor:
                self.executor.shutdown(wait=True, cancel_futures=True)
            if self.socket:
                self.socket.close()

    # --------------------------- Core Handling --------------------------- #
    def _handle_connection(self, client_socket: socket.socket, client_addr) -> None:
        try:
            # Rate limiting check first (based on remote IP)
            ip = client_addr[0]
            if not self._check_rate_limit(ip):
                self.send_response(client_socket, 429, "Too Many Requests", "text/plain", "Rate limit exceeded")
                return

            # Read request
            request_data = client_socket.recv(2048).decode("utf-8", errors="ignore")
            if not request_data:
                return

            request_line = request_data.split("\r\n", 1)[0]
            parts = request_line.split()
            if len(parts) < 3:
                self.send_response(client_socket, 400, "Bad Request", "text/plain")
                return

            method, path, _ = parts

            # Optional artificial delay to simulate work
            if self.simulate_delay > 0:
                time.sleep(self.simulate_delay)

            # Handle CORS preflight quickly
            if method == "OPTIONS":
                self.send_response(client_socket, 200, "OK", "text/plain", "")
                return

            if method != "GET":
                self.send_response(client_socket, 405, "Method Not Allowed", "text/plain")
                return

            # Decode and normalize path
            url_path = urllib.parse.unquote(path.split("?", 1)[0])
            if ".." in url_path:
                self.send_response(client_socket, 403, "Forbidden", "text/plain")
                return

            # Count the request for this path (demonstrates race if naive)
            self._increment_counter(url_path)

            # Map to filesystem
            if url_path == "/":
                file_path = self.directory
            else:
                file_path = os.path.join(self.directory, url_path.lstrip("/"))
            file_path = os.path.normpath(file_path)
            if not file_path.startswith(self.directory):
                self.send_response(client_socket, 403, "Forbidden", "text/plain")
                return

            if os.path.isfile(file_path):
                self._serve_file(client_socket, file_path)
            elif os.path.isdir(file_path):
                self._serve_directory(client_socket, file_path, url_path)
            else:
                self._send_404(client_socket)
        except Exception as e:
            # Avoid crashing a worker
            try:
                self.send_response(client_socket, 500, "Internal Server Error", "text/plain")
            except Exception:
                pass
        finally:
            try:
                client_socket.close()
            except Exception:
                pass

    # ---------------------- Counters & Rate Limiting --------------------- #
    def _increment_counter(self, path: str) -> None:
        # Naive mode: read-modify-write without lock, optional interleave
        if self.counter_mode == "naive":
            current = self.request_counts[path]
            if self.naive_interleave_ms > 0:
                time.sleep(self.naive_interleave_ms / 1000.0)
            self.request_counts[path] = current + 1
            return

        # Locked mode
        with self.count_lock:
            self.request_counts[path] += 1

    def _get_count(self, path: str) -> int:
        # Reading without lock is OK for ints in CPython for visibility in practice,
        # but we can still guard it to be precise.
        with self.count_lock:
            return int(self.request_counts.get(path, 0))

    def _check_rate_limit(self, ip: str) -> bool:
        now = time.monotonic()
        with self.rate_lock:
            dq = self.rate_map[ip]
            # Drop old timestamps
            window_start = now - self.rate_window
            while dq and dq[0] < window_start:
                dq.popleft()
            if len(dq) >= self.rate_limit:
                return False
            dq.append(now)
            return True

    # ---------------------------- Responders ----------------------------- #
    def _serve_file(self, client_socket: socket.socket, file_path: str) -> None:
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            _, ext = os.path.splitext(file_path)
            content_type = self.mime_types.get(ext.lower(), "application/octet-stream")
            self.send_response(client_socket, 200, "OK", content_type, content)
        except OSError:
            self._send_404(client_socket)

    def _serve_directory(self, client_socket: socket.socket, dir_path: str, url_path: str) -> None:
        try:
            items = os.listdir(dir_path)
            items.sort()
            html = self._generate_directory_listing(items, dir_path, url_path)
            self.send_response(client_socket, 200, "OK", "text/html", html.encode("utf-8"))
        except OSError:
            self._send_404(client_socket)

    def _generate_directory_listing(self, items: list[str], dir_path: str, url_path: str) -> str:
        if not url_path.endswith("/"):
            url_path = url_path + "/"
        html = f"""<!DOCTYPE html>
<html>
<head>
  <title>Directory listing for {url_path}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 40px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }}
    th {{ background-color: #f2f2f2; }}
    .size {{ text-align: right; }}
    .date {{ white-space: nowrap; }}
    .hits {{ text-align: right; }}
  </style>
  </head>
  <body>
    <h1>Directory listing for {url_path}</h1>
    <hr>
    <table>
      <tr><th>Name</th><th class=\"size\">Size</th><th class=\"date\">Last Modified</th><th class=\"hits\">Hits</th></tr>"""

        # Parent directory link
        if url_path != "/":
            parent_parts = url_path.rstrip("/").split("/")
            parent_path = "/" if len(parent_parts) <= 1 else "/".join(parent_parts[:-1]) + "/"
            parent_hits = self._get_count(parent_path)
            html += f"\n      <tr><td><a href=\"{parent_path}\">../</a></td><td class=\"size\">-</td><td class=\"date\">-</td><td class=\"hits\">{parent_hits}</td></tr>"

        for item in items:
            item_fs_path = os.path.join(dir_path, item)
            item_url = url_path + urllib.parse.quote(item)
            if os.path.isdir(item_fs_path):
                name = item + "/"
                size = "-"
                item_url += "/"
            else:
                name = item
                try:
                    size = self._format_size(os.path.getsize(item_fs_path))
                except OSError:
                    size = "-"
            try:
                mtime = os.path.getmtime(item_fs_path)
                date = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
            except OSError:
                date = "-"
            hits = self._get_count(item_url)
            html += f"\n      <tr><td><a href=\"{item_url}\">{name}</a></td><td class=\"size\">{size}</td><td class=\"date\">{date}</td><td class=\"hits\">{hits}</td></tr>"

        html += "\n    </table>\n    <hr>\n    <p><em>Python Concurrent HTTP File Server (LAB2)</em></p>\n  </body>\n</html>"
        return html

    def _format_size(self, size: int) -> str:
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024.0:
                return f"{size:.1f}{unit}"
            size /= 1024.0
        return f"{size:.1f}TB"

    def send_response(self, client_socket: socket.socket, status_code: int, status_text: str, content_type: str, content=None) -> None:
        if content is None:
            content = status_text.encode("utf-8")
        elif isinstance(content, str):
            content = content.encode("utf-8")

        headers = [
            f"HTTP/1.1 {status_code} {status_text}",
            f"Content-Type: {content_type}",
            f"Content-Length: {len(content)}",
            "Server: Python HTTP File Server (LAB2)",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers: Content-Type",
            "",
            "",
        ]
        client_socket.send("\r\n".join(headers).encode("utf-8"))
        client_socket.send(content)

    def _send_404(self, client_socket: socket.socket) -> None:
        html = (
            "<!DOCTYPE html><html><head><title>404 Not Found</title></head>"
            "<body><h1>404 - File Not Found</h1></body></html>"
        )
        self.send_response(client_socket, 404, "Not Found", "text/html", html)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LAB2 Concurrent HTTP File Server")
    parser.add_argument("directory", help="Directory to serve")
    parser.add_argument("--host", default=os.getenv("LAB2_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("LAB2_PORT", "8080")))
    parser.add_argument("--workers", type=int, default=int(os.getenv("LAB2_WORKERS", "8")))
    parser.add_argument("--delay", type=float, default=float(os.getenv("LAB2_DELAY", "0")), help="Artificial delay (seconds) to simulate work")
    parser.add_argument("--counter-mode", choices=["naive", "locked"], default=os.getenv("LAB2_COUNTER_MODE", "locked"))
    parser.add_argument("--naive-interleave-ms", type=int, default=int(os.getenv("LAB2_NAIVE_INTERLEAVE_MS", "0")), help="Extra sleep in naive increment to expose race conditions")
    parser.add_argument("--rate-limit", type=int, default=int(os.getenv("LAB2_RATE_LIMIT", "5")))
    parser.add_argument("--rate-window", type=float, default=float(os.getenv("LAB2_RATE_WINDOW", "1.0")))
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args(sys.argv[1:])
    if not os.path.isdir(args.directory):
        print(f"Error: '{args.directory}' is not a directory")
        sys.exit(1)

    server = HTTPServer(
        host=args.host,
        port=args.port,
        directory=args.directory,
        workers=args.workers,
        simulate_delay=args.delay,
        counter_mode=args.counter_mode,
        naive_interleave_ms=args.naive_interleave_ms,
        rate_limit=args.rate_limit,
        rate_window=args.rate_window,
    )
    server.start()


if __name__ == "__main__":
    main()
