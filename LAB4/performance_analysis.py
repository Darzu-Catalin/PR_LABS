import requests
import time
import sys
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import matplotlib.pyplot as plt
import numpy as np

# Configuration
LEADER_URL = "http://localhost:8000"
FOLLOWER_URLS = [f"http://localhost:{8001 + i}" for i in range(5)]
NUM_WRITES = 100
NUM_KEYS = 10
NUM_THREADS = 10


def wait_for_services(timeout=60):
    """Wait for all services to be healthy."""
    print("Waiting for services to start...")
    start_time = time.time()
    
    all_urls = [LEADER_URL] + FOLLOWER_URLS
    
    while time.time() - start_time < timeout:
        all_healthy = True
        for url in all_urls:
            try:
                response = requests.get(f"{url}/health", timeout=2)
                if response.status_code != 200:
                    all_healthy = False
                    break
            except Exception:
                all_healthy = False
                break
        
        if all_healthy:
            print("All services are healthy!")
            return True
        
        time.sleep(1)
    
    print("Timeout waiting for services to start")
    return False


def restart_cluster_with_quorum(quorum):
    """Restart the cluster with a specific write quorum value."""
    print(f"\n{'='*60}")
    print(f"Restarting cluster with WRITE_QUORUM={quorum}")
    print(f"{'='*60}")
    
    # Stop existing containers
    subprocess.run(["docker-compose", "down"], cwd=os.path.dirname(os.path.abspath(__file__)))
    time.sleep(1)
    
    # Update docker-compose with a new quorum
    compose_content = f"""
services:
  leader:
    build: .
    container_name: leader
    command: python leader.py
    ports:
      - "8000:5000"
    environment:
      - WRITE_QUORUM={quorum}
      - MIN_DELAY=0.0001
      - MAX_DELAY=1
      - PORT=5000
    networks:
      - kvstore_network

  follower1:
    build: .
    container_name: follower1
    command: python follower.py
    ports:
      - "8001:5000"
    environment:
      - FOLLOWER_ID=1
      - PORT=5000
    networks:
      - kvstore_network
    depends_on:
      - leader

  follower2:
    build: .
    container_name: follower2
    command: python follower.py
    ports:
      - "8002:5000"
    environment:
      - FOLLOWER_ID=2
      - PORT=5000
    networks:
      - kvstore_network
    depends_on:
      - leader

  follower3:
    build: .
    container_name: follower3
    command: python follower.py
    ports:
      - "8003:5000"
    environment:
      - FOLLOWER_ID=3
      - PORT=5000
    networks:
      - kvstore_network
    depends_on:
      - leader

  follower4:
    build: .
    container_name: follower4
    command: python follower.py
    ports:
      - "8004:5000"
    environment:
      - FOLLOWER_ID=4
      - PORT=5000
    networks:
      - kvstore_network
    depends_on:
      - leader

  follower5:
    build: .
    container_name: follower5
    command: python follower.py
    ports:
      - "8005:5000"
    environment:
      - FOLLOWER_ID=5
      - PORT=5000
    networks:
      - kvstore_network
    depends_on:
      - leader

networks:
  kvstore_network:
    driver: bridge
"""
    
    compose_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docker-compose.yml")
    with open(compose_path, 'w') as f:
        f.write(compose_content)
    
    # Start containers
    subprocess.run(["docker-compose", "up", "-d", "--build"], 
                   cwd=os.path.dirname(os.path.abspath(__file__)))
    
    # Wait for services to be ready
    if not wait_for_services(timeout=90):
        print("ERROR: Services did not start")
        sys.exit(1)
    
    time.sleep(3)  # Additional time for full initialization


def perform_concurrent_writes():
    """Perform NUM_WRITES concurrent writes on NUM_KEYS keys."""
    print(f"\nPerforming {NUM_WRITES} concurrent writes on {NUM_KEYS} keys using {NUM_THREADS} threads...")
    
    latencies = []
    
    def write_operation(write_id):
        key = f"key_{write_id % NUM_KEYS}"
        value = f"value_{write_id}"
        
        start_time = time.time()
        try:
            response = requests.post(
                f"{LEADER_URL}/write",
                json={"key": key, "value": value},
                timeout=10
            )
            end_time = time.time()
            latency = (end_time - start_time) * 1000  # Convert to milliseconds
            
            return latency if response.status_code == 200 else None
        except Exception as e:
            print(f"Write {write_id} failed: {e}")
            return None
    
    # Perform concurrent writes
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        futures = [executor.submit(write_operation, i) for i in range(NUM_WRITES)]
        
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                latencies.append(result)
    
    total_time = time.time() - start_time
    
    successful_writes = len(latencies)
    avg_latency = np.mean(latencies) if latencies else 0
    median_latency = np.median(latencies) if latencies else 0
    p95_latency = np.percentile(latencies, 95) if latencies else 0
    p99_latency = np.percentile(latencies, 99) if latencies else 0

    print(f"Completed in {total_time:.2f} seconds")
    print(f"Successful writes: {successful_writes}/{NUM_WRITES}")
    print(f"Average latency: {avg_latency:.2f} ms")
    print(f"Median latency: {median_latency:.2f} ms")
    print(f"P95 latency: {p95_latency:.2f} ms")
    print(f"P99 latency: {p99_latency:.2f} ms")
    
    return {
        'successful_writes': successful_writes,
        'avg_latency': avg_latency,
        'median_latency': median_latency,
        'p95_latency': p95_latency,
        'p99_latency': p99_latency,
        'total_time': total_time
    }


def check_data_consistency():
    """Check if data in replicas matches data on the leader."""
    print("\nChecking data consistency across replicas...")
    
    # Get data from leader
    response = requests.get(f"{LEADER_URL}/data")
    leader_data = response.json()
    print(f"Leader has {len(leader_data)} keys")
    
    consistency_results = []
    
    for i, follower_url in enumerate(FOLLOWER_URLS):
        response = requests.get(f"{follower_url}/data")
        follower_data = response.json()
        
        # Count matching, missing, and extra keys
        common_keys = set(leader_data.keys()) & set(follower_data.keys())
        missing_keys = set(leader_data.keys()) - set(follower_data.keys())
        extra_keys = set(follower_data.keys()) - set(leader_data.keys())
        
        # Check value consistency for common keys
        value_mismatches = 0
        for key in common_keys:
            if leader_data[key] != follower_data[key]:
                value_mismatches += 1
        
        consistency = len(common_keys) / len(leader_data) * 100 if leader_data else 100
        
        print(f"Follower {i+1}:")
        print(f"  Total keys: {len(follower_data)}")
        print(f"  Common keys: {len(common_keys)}")
        print(f"  Missing keys: {len(missing_keys)}")
        print(f"  Extra keys: {len(extra_keys)}")
        print(f"  Value mismatches: {value_mismatches}")
        print(f"  Consistency: {consistency:.2f}%")
        
        consistency_results.append({
            'follower_id': i + 1,
            'total_keys': len(follower_data),
            'common_keys': len(common_keys),
            'missing_keys': len(missing_keys),
            'extra_keys': len(extra_keys),
            'value_mismatches': value_mismatches,
            'consistency_percent': consistency
        })
    
    return consistency_results


def run_performance_analysis():
    """Run performance analysis for different write quorum values."""
    print("=" * 60)
    print("PERFORMANCE ANALYSIS: WRITE QUORUM VS LATENCY")
    print("=" * 60)
    
    quorum_values = [1, 2, 3, 4, 5]
    results = {}
    
    for quorum in quorum_values:
        restart_cluster_with_quorum(quorum)
        
        # Perform writes
        perf_results = perform_concurrent_writes()
        
        # Wait for replication to complete
        print("\nWaiting for replication to complete...")
        time.sleep(5)
        
        # Check consistency
        consistency_results = check_data_consistency()
        
        results[quorum] = {
            'performance': perf_results,
            'consistency': consistency_results
        }
    
    # Plot results
    plot_results(results)
    
    # Print analysis
    print_analysis(results)
    
    return results


def plot_results(results):
    """Plot write quorum vs average latency."""
    print("\nGenerating plots...")
    
    quorums = sorted(results.keys())
    avg_latencies = [results[q]['performance']['avg_latency'] for q in quorums]
    median_latencies = [results[q]['performance']['median_latency'] for q in quorums]
    p95_latencies = [results[q]['performance']['p95_latency'] for q in quorums]
    p99_latencies = [results[q]['performance']['p99_latency'] for q in quorums]
    
    plt.figure(figsize=(12, 6))
    
    # Plot 1: Latency vs Quorum
    plt.subplot(1, 2, 1)
    plt.plot(quorums, avg_latencies, marker='o', label='Average', linewidth=2)
    plt.plot(quorums, median_latencies, marker='s', label='Median', linewidth=2)
    plt.plot(quorums, p95_latencies, marker='^', label='P95', linewidth=2)
    plt.plot(quorums, p99_latencies, marker='v', label='P99', linewidth=2)
    plt.xlabel('Write Quorum', fontsize=12)
    plt.ylabel('Latency (ms)', fontsize=12)
    plt.title('Write Quorum vs Latency', fontsize=14, fontweight='bold')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.xticks(quorums)
    
    # Plot 2: Consistency
    plt.subplot(1, 2, 2)
    consistency_data = []
    for q in quorums:
        consistencies = [f['consistency_percent'] for f in results[q]['consistency']]
        avg_consistency = np.mean(consistencies)
        consistency_data.append(avg_consistency)
    
    plt.bar(quorums, consistency_data, alpha=0.7, color='skyblue', edgecolor='navy')
    plt.xlabel('Write Quorum', fontsize=12)
    plt.ylabel('Average Consistency (%)', fontsize=12)
    plt.title('Write Quorum vs Data Consistency', fontsize=14, fontweight='bold')
    plt.ylim([0, 105])
    plt.grid(True, alpha=0.3, axis='y')
    plt.xticks(quorums)
    
    plt.tight_layout()
    
    # Save plot
    plot_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'performance_analysis.png')
    plt.savefig(plot_path, dpi=300, bbox_inches='tight')
    print(f"Plot saved to: {plot_path}")
    
    plt.show()


def print_analysis(results):
    """Print detailed analysis of the results."""
    print("\n" + "=" * 60)
    print("ANALYSIS AND EXPLANATION")
    print("=" * 60)
    
    print("\n1. LATENCY ANALYSIS:")
    print("-" * 60)
    print("As the write quorum increases, the average write latency increases.")
    print("This is because:")
    print("  - With a higher quorum, the leader must wait for more followers")
    print("    to acknowledge the write before responding to the client.")
    print("  - Even though replication requests are sent concurrently, the")
    print("    leader waits for the slowest of the required replicas.")
    print("  - Network delays (simulated as 0.1-1ms) compound when waiting")
    print("    for more acknowledgments.")
    
    quorums = sorted(results.keys())
    print("\nObserved latencies:")
    for q in quorums:
        avg_lat = results[q]['performance']['avg_latency']
        print(f"  Quorum {q}: {avg_lat:.2f} ms average")
    
    print("\n2. CONSISTENCY ANALYSIS:")
    print("-" * 60)
    print("After all writes complete, we check if replicas match the leader.")
    
    for q in quorums:
        consistency_results = results[q]['consistency']
        avg_consistency = np.mean([f['consistency_percent'] for f in consistency_results])
        print(f"\nQuorum {q}: {avg_consistency:.2f}% average consistency")
        
        for follower in consistency_results:
            if follower['missing_keys'] > 0:
                print(f"  Follower {follower['follower_id']}: "
                      f"missing {follower['missing_keys']} keys")
    
    print("\nKey observations:")
    print("  - With lower quorums (1-2), some followers may lag behind")
    print("    because not all followers need to acknowledge writes.")
    print("  - With higher quorums (3-5), consistency improves as more")
    print("    followers must acknowledge each write synchronously.")
    print("  - Eventually, all followers should catch up through")
    print("    asynchronous replication (given enough time).")
    
    print("\n3. TRADE-OFFS:")
    print("-" * 60)
    print("  - Lower quorum = Lower latency, but weaker consistency guarantees")
    print("  - Higher quorum = Higher latency, but stronger consistency guarantees")
    print("  - This demonstrates the classic trade-off between availability")
    print("    and consistency in distributed systems (CAP theorem).")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    try:
        results = run_performance_analysis()
        
        # Cleanup
        print("\n" + "=" * 60)
        print("PERFORMANCE ANALYSIS COMPLETED")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n\nAnalysis interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
