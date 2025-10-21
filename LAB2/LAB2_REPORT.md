# Lab 2: Concurrent HTTP File Server

Student: Catalin Darzu  
Course: Programarea în rețea

---

## Overview

This lab extends the HTTP file server from Lab 1 with real concurrency:
- A thread-pool-based server that handles multiple connections concurrently
- A request counter per-path (first naive/racy, then fixed with locking)
- Per-IP rate limiting (~5 req/s) implemented in a thread-safe way
- Benchmark tooling to compare single-threaded vs concurrent performance

The code lives in `LAB2/` and intentionally starts with empty `content/`, `downloads/`, and `screenshots/` directories so you can add your own test payloads and artifacts.

---

## Concurrency background (PLT vs OS)

- OS (low-level) perspective:
	- Concurrency = tasks overlap in time (including interleaving)
	- Parallelism = tasks run simultaneously on multiple processors
	- Parallel ⇒ Concurrent, but not vice-versa
- PLT (high-level) perspective:
	- Concurrency is a structuring concept: a program is constructed from independent components that may interact
	- Parallelism is a hardware execution concept: computations happening at the same time
	- Concurrency and parallelism are orthogonal

This project follows the PLT view (see MIT 6.102 Section 4.3). Our server’s structure is concurrent (thread-per-connection via a pool), and depending on the machine, those threads may execute in parallel.

---

## Glossary (for this lab)

- Concurrency: Program structure composed of independently-executing components that may interact. Not the same thing as simultaneous execution.
- Parallelism: Hardware/runtime executing multiple computations at the same physical time (e.g., multiple cores).
- Race condition: Incorrect behavior due to non-atomic interleavings of shared-state operations.
- Mutual exclusion: Ensuring only one thread can execute a critical section at a time (e.g., with locks).
- Liveness: Something good eventually happens (e.g., requests eventually complete); contrasted with deadlock and starvation.
- Throughput: Completed requests per unit time; improved by concurrency and parallelism.
- Tail latency: The slowest requests (e.g., p95/p99), often worsened by contention or rate limiting.

---

## Project structure

```
LAB2/
├── Dockerfile
├── docker-compose.yml
├── run.sh
├── LAB2_REPORT.md                 # This document
├── README.md                      # Getting started notes
├── src/
│   ├── server.py                  # Concurrent HTTP server
│   └── benchmark.py               # Concurrency benchmark tool
├── content/                       # (empty) served files
├── downloads/                     # (empty) client saves
└── screenshots/                   # (empty) report images
```

---

## Implementation details

### 1) Concurrent server (thread pool)

- Uses `ThreadPoolExecutor` to handle each accepted connection on a worker thread.
- Configurable workers: `--workers N` (default 8)
- Artificial per-request delay for benchmarking: `--delay SECONDS` (default 0)
- Safe request parsing; supports GET and CORS OPTIONS; denies path traversal.

Design notes:
- We prefer a fixed-size pool (vs thread-per-request) to avoid unbounded thread creation under load.
- Socket accept loop remains single-threaded; each connection is handed to the pool immediately, minimizing head-of-line blocking.
- `SO_REUSEADDR` allows fast restarts during development.

### 2) Request counters (race demo and fix)

- Counts how many requests each path receives.
- Two modes:
	- `--counter-mode naive`: increments without a lock; optional `--naive-interleave-ms` to force a race window for demo.
	- `--counter-mode locked` (default): increments under a lock so counts are correct.
- The current hit count is shown in directory listings (“Hits” column) for each file/folder.

Correctness discussion:
- In naive mode, two threads can both read the same old value and write back `old+1`, losing an increment. Adding `--naive-interleave-ms` increases the overlap window to reliably reproduce the bug.
- In locked mode, the increment is an atomic critical section, ensuring linearizable counts.

### 3) Rate limiting (~5 req/s per IP)

- Sliding-window limiter per client IP with a `deque` of timestamps.
- Options: `--rate-limit N` and `--rate-window SECONDS` (defaults 5 and 1.0).
- Exceeding the limit returns HTTP 429 Too Many Requests.

Performance considerations:
- Sliding window keeps only recent timestamps; O(1) amortized operations per request.
- Limits are per-IP to allow fair sharing across multiple clients.

---

## How to run

Native (recommended for fast iteration):

```bash
# In LAB2/
# Run concurrent server with 1s delay and 8 workers
LAB2_DELAY=1 LAB2_WORKERS=8 ./run.sh server
```

Docker:

```bash
docker compose up --build -d
# Server will listen at http://localhost:8080
```

Environment variables passed by `run.sh` to the server:
- `LAB2_WORKERS` (default 8)
- `LAB2_DELAY` (default 0)
- `LAB2_COUNTER_MODE` (naive|locked, default locked)
- `LAB2_NAIVE_INTERLEAVE_MS` (default 0)
- `LAB2_RATE_LIMIT` (default 5)
- `LAB2_RATE_WINDOW` (default 1.0)

---

## Benchmarking concurrency

We provide `src/benchmark.py` to generate concurrent requests and measure time.

Quick run (10 requests at concurrency 10):

```bash
./run.sh bench
```

Custom parameters and CSV output:

```bash
# Target URL, parallelism, requests, trials; save one-line CSV summary
BENCH_URL=http://localhost:8080/ \
BENCH_CONCURRENCY=20 \
BENCH_REQUESTS=50 \
BENCH_TRIALS=5 \
BENCH_CSV=bench.csv \
./run.sh bench
```

Interpreting results:
- With `LAB2_DELAY=1`, single-threaded Lab 1 typically takes ~N seconds for N requests.
- Concurrent Lab 2 should compress total time toward delay × ceil(N / workers).
- If you see 429s, increase `LAB2_RATE_LIMIT` during tests.

Recommended report figures (add screenshots later):
- `screenshots/bench_naive_vs_locked.png` — Comparison of total time under naive vs locked counter at the same concurrency.
- `screenshots/bench_workers_sweep.png` — Sweep workers ∈ {1,2,4,8,16,32} at fixed requests, show speedup.
- `screenshots/bench_rate_limit.png` — Throughput curve as you vary `LAB2_RATE_LIMIT`.

---

## Race condition demonstration

1) Start server in naive mode and exaggerate interleaving:

```bash
LAB2_COUNTER_MODE=naive LAB2_NAIVE_INTERLEAVE_MS=20 ./run.sh server
```

2) Hit the same path concurrently (benchmark or browser refresh). Observe:
- Directory listing “Hits” may skip or undercount.

3) Start server in locked mode:

```bash
LAB2_COUNTER_MODE=locked ./run.sh server
```

4) Repeat the test; counts become consistent.

Optional: capture a side-by-side listing showing non-monotonic increments under naive mode, then the corrected listing with locked mode.

---

## Rate limiting demonstration

1) Default limiter (~5 req/s per IP):
- Spam with high concurrency; you’ll observe 429 responses once the rate exceeds the window.

2) Compare behaviors:
- One client spamming vs another just below the limit — the latter should see near-100% success throughput.

3) Tune the limiter during experiments:

```bash
LAB2_RATE_LIMIT=20 LAB2_RATE_WINDOW=1.0 ./run.sh server
```

---

## Testing methodology

1) Unit-like checks (manual):
- Request parsing: malformed lines return 400; unsupported methods return 405.
- Path traversal guard: attempts with `..` yield 403.
- 404 handling for non-existent files.

2) Concurrency checks:
- Start with `--delay 1` and submit 10 requests @ concurrency 10 — expect ≈1–2s total on an 8-worker pool.
- Reduce workers to 1 — expect ≈10s total, mirroring single-threaded behavior.

3) Rate-limiter checks:
- Default limits cause 429s above ~5 req/s; increase limit to confirm success rate rises.

4) Resource checks:
- Observe that thread count is bounded by pool size; memory growth remains stable during stress tests.

Artifacts to include later:
- `screenshots/requests_429.png` — Terminal showing 429 status.
- `screenshots/directory_hits_column.png` — Directory listing containing the Hits column.

---

## Screenshots (placeholders)

Add screenshots under `LAB2/screenshots/` and reference them here:
- `screenshots/dir_hits.png` – Directory listing with “Hits” column
- `screenshots/429_ratelimit.png` – Example of rate limiting in action
- `screenshots/benchmark_results.png` – Terminal output comparing runs

```markdown
![Directory hits](screenshots/dir_hits.png)
![Rate limiting 429](screenshots/429_ratelimit.png)
![Benchmark summary](screenshots/benchmark_results.png)
```

---

## Conclusion

This lab implements a concurrent HTTP server with:
- Thread pool concurrency and optional simulated work
- Observable race conditions (naive counter) and their resolution using locks
- Thread-safe per-IP rate limiting
- A benchmark tool and run helpers to quantify improvements

These experiments concretely illustrate the PLT view of concurrency (program structure) and how it can run in parallel depending on hardware and runtime.

---

## Appendix: Commands cheat-sheet

Server presets:
```bash
# Fast dev
./run.sh server

# Emulate CPU work for concurrency demos
LAB2_DELAY=1 LAB2_WORKERS=8 ./run.sh server

# Show race conditions
LAB2_COUNTER_MODE=naive LAB2_NAIVE_INTERLEAVE_MS=20 ./run.sh server

# Rate-limit tuning
LAB2_RATE_LIMIT=20 LAB2_RATE_WINDOW=1.0 ./run.sh server
```

Benchmark:
```bash
./run.sh bench
BENCH_CONCURRENCY=20 BENCH_REQUESTS=50 BENCH_TRIALS=5 BENCH_CSV=bench.csv ./run.sh bench
```
