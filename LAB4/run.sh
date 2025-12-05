#!/bin/bash

# Helper script to run the distributed key-value store lab

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Distributed Key-Value Store - Lab 4"
echo "=========================================="
echo ""

function print_help() {
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start          - Build and start the cluster"
    echo "  stop           - Stop the cluster"
    echo "  restart        - Restart the cluster"
    echo "  logs           - Show logs from all containers"
    echo "  test           - Run integration tests"
    echo "  analyze        - Run performance analysis (takes ~15-20 min)"
    echo "  clean          - Stop and remove all containers and volumes"
    echo "  status         - Check status of all services"
    echo "  help           - Show this help message"
    echo ""
}

function start_cluster() {
    echo -e "${YELLOW}Building and starting the cluster...${NC}"
    docker-compose up -d --build
    echo ""
    echo -e "${GREEN}✓ Cluster started successfully!${NC}"
    echo ""
    echo "Services running on:"
    echo "  Leader:    http://localhost:8000"
    echo "  Follower1: http://localhost:8001"
    echo "  Follower2: http://localhost:8002"
    echo "  Follower3: http://localhost:8003"
    echo "  Follower4: http://localhost:8004"
    echo "  Follower5: http://localhost:8005"
    echo ""
    echo "Waiting for services to be ready..."
    sleep 5
    check_status
}

function stop_cluster() {
    echo -e "${YELLOW}Stopping the cluster...${NC}"
    docker-compose down
    echo -e "${GREEN}✓ Cluster stopped${NC}"
}

function restart_cluster() {
    echo -e "${YELLOW}Restarting the cluster...${NC}"
    docker-compose restart
    echo -e "${GREEN}✓ Cluster restarted${NC}"
    sleep 3
    check_status
}

function show_logs() {
    echo -e "${YELLOW}Showing logs (Ctrl+C to exit)...${NC}"
    docker-compose logs -f
}

function run_tests() {
    echo -e "${YELLOW}Running integration tests...${NC}"
    echo ""
    
    # Check if Python dependencies are installed
    if ! python3 -c "import flask, requests" 2>/dev/null; then
        echo -e "${YELLOW}Installing Python dependencies...${NC}"
        pip install -r requirements.txt
    fi
    
    python3 integration_test.py
}

function run_analysis() {
    echo -e "${YELLOW}Running performance analysis...${NC}"
    echo -e "${YELLOW}This will take approximately 1-2 minutes...${NC}"
    echo ""
    
    # Check if Python dependencies are installed
    if ! python3 -c "import flask, requests, matplotlib, numpy" 2>/dev/null; then
        echo -e "${YELLOW}Installing Python dependencies...${NC}"
        pip install -r requirements.txt
    fi
    
    python3 performance_analysis.py
}

function clean_cluster() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    docker-compose down -v
    echo -e "${GREEN}✓ All containers and volumes removed${NC}"
}

function check_status() {
    echo -e "${YELLOW}Checking service status...${NC}"
    echo ""
    
    services=("http://localhost:8000" "http://localhost:8001" "http://localhost:8002" "http://localhost:8003" "http://localhost:8004" "http://localhost:8005")
    names=("Leader   " "Follower1" "Follower2" "Follower3" "Follower4" "Follower5")
    
    for i in "${!services[@]}"; do
        url="${services[$i]}"
        name="${names[$i]}"
        
        if curl -s -f "$url/health" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name - $url - ${GREEN}healthy${NC}"
        else
            echo -e "  ${RED}✗${NC} $name - $url - ${RED}unreachable${NC}"
        fi
    done
    echo ""
}

# Main script logic
case "$1" in
    start)
        start_cluster
        ;;
    stop)
        stop_cluster
        ;;
    restart)
        restart_cluster
        ;;
    logs)
        show_logs
        ;;
    test)
        run_tests
        ;;
    analyze)
        run_analysis
        ;;
    clean)
        clean_cluster
        ;;
    status)
        check_status
        ;;
    help|"")
        print_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        print_help
        exit 1
        ;;
esac
