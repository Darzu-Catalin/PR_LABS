#!/usr/bin/env python3
"""
bench_compare.py

Start two LAB2 servers with different worker counts (1 vs N) on separate ports,
run concurrent requests with an artificial delay, and print a comparison that
clearly demonstrates the effect of concurrency without hitting the rate limiter.
"""

import argparse
import os
import signal
import subprocess
import sys
import time
import urllib.request
import concurrent.futures


def wait_ready(url: str, timeout: float = 5.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url) as resp:
                return True
        except Exception:
            time.sleep(0.1)
    return False


def fetch(url: str) -> int:
    with urllib.request.urlopen(url) as resp:
        return resp.getcode()


def run_once(url: str, concurrency: int, requests: int) -> tuple[float, int]:
    t0 = time.perf_counter()
    ok = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as ex:
        futs = [ex.submit(fetch, url) for _ in range(requests)]
        for f in concurrent.futures.as_completed(futs):
            try:
                if f.result() == 200:
                    ok += 1
            except Exception:
                pass
    return time.perf_counter() - t0, ok


def start_server(port: int, workers: int, delay: float, rate_limit: int) -> subprocess.Popen:
    env = os.environ.copy()
    env["LAB2_WORKERS"] = str(workers)
    env["LAB2_DELAY"] = str(delay)
    env["LAB2_RATE_LIMIT"] = str(rate_limit)
    cmd = [sys.executable, "src/server.py", "content", "--port", str(port)]
    proc = subprocess.Popen(cmd, cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")), env=env)
    return proc


def stop_server(proc: subprocess.Popen) -> None:
    try:
        proc.send_signal(signal.SIGTERM)
    except Exception:
        pass
    try:
        proc.wait(timeout=2)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Compare workers=1 vs workers=N for LAB2 server")
    parser.add_argument("--requests", type=int, default=10)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--delay", type=float, default=1.0, help="Artificial server delay per request (s)")
    parser.add_argument("--rate-limit", type=int, default=1000, help="High limit to avoid 429 during timing")
    parser.add_argument("--port1", type=int, default=8091)
    parser.add_argument("--portN", type=int, default=8092)
    args = parser.parse_args()

    # Single-threaded-ish server (workers=1)
    p1 = start_server(args.port1, 1, args.delay, args.rate_limit)
    url1 = f"http://localhost:{args.port1}/"
    if not wait_ready(url1):
        print(f"ERROR: server workers=1 not ready at {url1}")
        stop_server(p1)
        sys.exit(1)

    # Concurrent server (workers=N)
    pN = start_server(args.portN, args.workers, args.delay, args.rate_limit)
    urlN = f"http://localhost:{args.portN}/"
    if not wait_ready(urlN):
        print(f"ERROR: server workers={args.workers} not ready at {urlN}")
        stop_server(p1)
        stop_server(pN)
        sys.exit(1)

    try:
        # Benchmark both
        dt1, ok1 = run_once(url1, args.concurrency, args.requests)
        dtN, okN = run_once(urlN, args.concurrency, args.requests)

        print("\n=== Concurrency Demonstration ===")
        print(f"Requests={args.requests}, Concurrency={args.concurrency}, Delay={args.delay}s")
        print(f"workers=1  -> {dt1:.2f}s; 200 OK: {ok1}")
        print(f"workers={args.workers:<2} -> {dtN:.2f}s; 200 OK: {okN}")
        if args.delay > 0:
            from math import ceil
            expected = args.delay * ceil(args.requests / max(1, args.workers))
            print(f"Expected ideal concurrent time ≈ {expected:.2f}s (delay × ceil(req/workers))")
    finally:
        stop_server(p1)
        stop_server(pN)


if __name__ == "__main__":
    main()
