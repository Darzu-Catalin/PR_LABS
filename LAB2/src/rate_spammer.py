#!/usr/bin/env python3
"""
Rate Spammer: generate a target number of HTTP GET requests per second
and report per-second status code statistics (e.g., 200 vs 429).

Usage:
  python3 src/rate_spammer.py http://localhost:8080/ --rps 50 --duration 5 --concurrency 50

Notes:
  - Uses only the Python standard library (urllib, threading, queue).
  - Aims for steady overall RPS using a scheduled queue of send times.
  - Prints per-second buckets with 200/429/other counts and achieved RPS.
"""

from __future__ import annotations

import argparse
import threading
import time
from collections import Counter, defaultdict
from queue import Queue, Empty
from typing import Dict
from urllib import request, error


def fetch_once(url: str, timeout: float = 5.0) -> int:
    try:
        with request.urlopen(url, timeout=timeout) as resp:
            return int(resp.getcode())
    except error.HTTPError as e:
        return int(e.code)
    except Exception:
        return -1  # network or other error


def worker(url: str, q: Queue[float], stop_at: float, bucket_counts: Dict[int, Counter], lock: threading.Lock) -> None:
    while True:
        try:
            send_at = q.get(timeout=0.5)
        except Empty:
            if time.monotonic() > stop_at:
                return
            continue

        now = time.monotonic()
        if send_at > now:
            time.sleep(send_at - now)

        code = fetch_once(url)

        sec = int(time.time())  # wall clock seconds bucket
        with lock:
            bucket_counts[sec][code] += 1


def schedule_tokens(start: float, stop: float, interval: float, q: Queue[float]) -> None:
    n = 0
    t = start
    while t < stop:
        q.put(t)
        n += 1
        t = start + n * interval


def format_bucket(sec: int, counts: Counter) -> str:
    ok = counts.get(200, 0)
    denied = counts.get(429, 0)
    other = sum(v for k, v in counts.items() if k not in (200, 429))
    total = ok + denied + other
    ts = time.strftime("%H:%M:%S", time.localtime(sec))
    return f"{ts}  total={total:3d} | 200={ok:3d}  429={denied:3d}  other={other:3d}  (rps≈{total})"


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate HTTP requests at a target RPS and report per-second stats")
    ap.add_argument("url", help="Target URL (e.g., http://localhost:8080/)")
    ap.add_argument("--rps", type=int, default=50, help="Target requests per second (overall)")
    ap.add_argument("--duration", type=int, default=5, help="Duration in seconds")
    ap.add_argument("--concurrency", type=int, default=50, help="Number of worker threads")
    args = ap.parse_args()

    rps = max(1, int(args.rps))
    duration = max(1, int(args.duration))
    conc = max(1, int(args.concurrency))

    print(f"Rate spammer → url={args.url} rps={rps} duration={duration}s concurrency={conc}")

    interval = 1.0 / float(rps)
    start = time.monotonic() + 0.2  # small warmup to start workers
    stop = start + duration

    q: Queue[float] = Queue(maxsize=rps * duration * 2)
    buckets: Dict[int, Counter] = defaultdict(Counter)
    lock = threading.Lock()

    # Start workers
    threads = [
        threading.Thread(target=worker, args=(args.url, q, stop, buckets, lock), daemon=True)
        for _ in range(conc)
    ]
    for t in threads:
        t.start()

    # Schedule tokens (send times)
    schedule_tokens(start, stop, interval, q)

    # Wait for workers to drain
    for t in threads:
        t.join()

    # Summarize
    if not buckets:
        print("No requests were sent.")
        return

    secs = sorted(buckets.keys())
    print("\nPer-second stats:")
    total = Counter()
    for sec in secs:
        line = format_bucket(sec, buckets[sec])
        print(line)
        total.update(buckets[sec])

    ok = total.get(200, 0)
    denied = total.get(429, 0)
    other = sum(v for k, v in total.items() if k not in (200, 429))
    sent = ok + denied + other
    achieved = sent / duration
    print("\nSummary:")
    print(f"sent={sent} in {duration}s  → achieved_rps≈{achieved:.1f}")
    print(f"200 OK={ok}  429 TooMany={denied}  other={other}")


if __name__ == "__main__":
    main()
