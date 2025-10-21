#!/usr/bin/env python3
"""
Benchmark script for LAB2 concurrent server vs single-threaded.
- Issues N concurrent GET requests with optional delay on server side.
- Measures total time and 200 OK count.
- NEW: supports multiple trials and CSV export of results (min/avg/max).
"""

import argparse
import concurrent.futures
import csv
import statistics
import time
import urllib.request


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


def main():
    parser = argparse.ArgumentParser(description="Benchmark concurrent HTTP server")
    parser.add_argument("url", help="Base URL, e.g. http://localhost:8080/")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--requests", type=int, default=10)
    parser.add_argument("--trials", type=int, default=1, help="Repeat benchmark this many times")
    parser.add_argument("--csv", type=str, default="", help="Optional CSV output path")
    args = parser.parse_args()

    durations = []
    oks = []
    for i in range(args.trials):
        dt, ok = run_once(args.url, args.concurrency, args.requests)
        durations.append(dt)
        oks.append(ok)
        print(f"Trial {i+1}/{args.trials}: {args.requests} req @ {args.concurrency} conc -> {dt:.2f}s; 200 OK: {ok}")

    summary = {
        "trials": args.trials,
        "requests": args.requests,
        "concurrency": args.concurrency,
        "min_s": min(durations),
        "avg_s": statistics.mean(durations),
        "max_s": max(durations),
        "avg_ok": statistics.mean(oks),
    }
    print(
        f"Summary: min {summary['min_s']:.2f}s | avg {summary['avg_s']:.2f}s | max {summary['max_s']:.2f}s | avg 200 OK {summary['avg_ok']:.1f}"
    )

    if args.csv:
        fieldnames = [
            "url",
            "concurrency",
            "requests",
            "trials",
            "min_s",
            "avg_s",
            "max_s",
            "avg_ok",
        ]
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerow({
                "url": args.url,
                "concurrency": args.concurrency,
                "requests": args.requests,
                "trials": args.trials,
                "min_s": f"{summary['min_s']:.4f}",
                "avg_s": f"{summary['avg_s']:.4f}",
                "max_s": f"{summary['max_s']:.4f}",
                "avg_ok": f"{summary['avg_ok']:.1f}",
            })
        print(f"CSV written: {args.csv}")


if __name__ == "__main__":
    main()
