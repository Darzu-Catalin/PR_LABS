#!/bin/bash

# HTTP File Server - LAB2 Quick Start Script

echo "=== HTTP File Server LAB2 ==="
echo ""

show_usage() {
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  server        - Start the HTTP server (native Python, concurrent)"
    echo "  docker        - Start server with Docker Compose"
    echo "  docker-build  - Build and start with Docker Compose"
    echo "  client        - Run example client commands"
    echo "  bench         - Run concurrency benchmark (10 parallel requests)"
    echo "  bench-compare - Start workers=1 vs workers=N servers and compare timings"
    echo "  clean         - Clean up Docker containers"
    echo ""
}

start_server() {
    echo "Starting Concurrent HTTP File Server (LAB2)..."
    echo "Server will be available at: http://localhost:8080"
    echo "Serving directory: $(pwd)/content"
    echo "Workers: ${LAB2_WORKERS:-8}, Delay: ${LAB2_DELAY:-0}s, Counter Mode: ${LAB2_COUNTER_MODE:-locked}"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    python3 src/server.py content --workers "${LAB2_WORKERS:-8}" --delay "${LAB2_DELAY:-0}" --counter-mode "${LAB2_COUNTER_MODE:-locked}" --naive-interleave-ms "${LAB2_NAIVE_INTERLEAVE_MS:-0}" --rate-limit "${LAB2_RATE_LIMIT:-5}" --rate-window "${LAB2_RATE_WINDOW:-1.0}"
}

start_docker() {
    echo "Starting HTTP File Server LAB2 with Docker..."
    docker-compose up
}

build_docker() {
    echo "Building and starting HTTP File Server LAB2 with Docker..."
    docker-compose up --build
}

run_client() {
    echo "Running HTTP Client examples (LAB2)..."
    echo ""
    if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo "⚠️  Server is not running on localhost:8080"
        echo "Please start the server first with: $0 server"
        return 1
    fi
    echo "1. Testing HTML download:"
    python3 src/client.py localhost 8080 / downloads
    echo "2. Testing PDF download:"
    python3 src/client.py localhost 8080 /sample.pdf downloads
    echo "3. Testing PNG download:"
    python3 src/client.py localhost 8080 /library.png downloads
}

bench() {
    local URL="${BENCH_URL:-http://localhost:8080/}"
    local CONC="${BENCH_CONCURRENCY:-10}"
    local REQS="${BENCH_REQUESTS:-10}"
    local TRIALS="${BENCH_TRIALS:-1}"
    local CSV_ARG=""
    if [ -n "${BENCH_CSV:-}" ]; then
        CSV_ARG="--csv \"$BENCH_CSV\""
    fi
    echo "Benchmark: url=$URL concurrency=$CONC requests=$REQS trials=$TRIALS (set LAB2_DELAY=1 to simulate work)"
    # shellcheck disable=SC2086
    python3 src/benchmark.py "$URL" --concurrency "$CONC" --requests "$REQS" --trials "$TRIALS" $CSV_ARG
}

bench_compare() {
    local REQS="${BENCH_REQUESTS:-10}"
    local CONC="${BENCH_CONCURRENCY:-10}"
    local WORKERS="${BENCH_WORKERS:-8}"
    local DELAY="${BENCH_DELAY:-1}"
    local RLIM="${BENCH_RATE_LIMIT:-1000}"
    local PORT1="${BENCH_PORT1:-8091}"
    local PORTN="${BENCH_PORTN:-8092}"
    echo "Compare: requests=$REQS concurrency=$CONC workers=$WORKERS delay=${DELAY}s ports=$PORT1/$PORTN"
    python3 src/bench_compare.py --requests "$REQS" --concurrency "$CONC" --workers "$WORKERS" --delay "$DELAY" --rate-limit "$RLIM" --port1 "$PORT1" --portN "$PORTN"
}

clean_docker() {
    echo "Cleaning up Docker containers (LAB2)..."
    docker-compose down
    docker-compose rm -f
}

case "${1:-}" in
    server) start_server ;;
    docker) start_docker ;;
    docker-build) build_docker ;;
    client) run_client ;;
    bench) bench ;;
    bench-compare) bench_compare ;;
    clean) clean_docker ;;
    *) show_usage ;;
 esac
