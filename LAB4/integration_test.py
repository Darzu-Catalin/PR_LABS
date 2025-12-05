import requests
import time
import sys
from concurrent.futures import ThreadPoolExecutor

# Configuration
LEADER_URL = "http://localhost:8000"
FOLLOWER_URLS = [f"http://localhost:{8001 + i}" for i in range(5)]

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
        
        time.sleep(2)
    
    print("Timeout waiting for services to start")
    return False


def test_write_and_read():
    """Test basic write and read operations."""
    print("\n=== Test 1: Basic Write and Read ===")
    
    # Write a key-value pair
    response = requests.post(f"{LEADER_URL}/write", json={"key": "test_key", "value": "test_value"})
    assert response.status_code == 200, f"Write failed: {response.text}"
    print("✓ Write successful")
    
    # Give time for replication
    time.sleep(1)
    
    # Read from leader
    response = requests.get(f"{LEADER_URL}/read", params={"key": "test_key"})
    assert response.status_code == 200, f"Read from leader failed: {response.text}"
    assert response.json()["value"] == "test_value", "Value mismatch on leader"
    print("✓ Read from leader successful")
    
    # Read from followers
    for i, follower_url in enumerate(FOLLOWER_URLS):
        response = requests.get(f"{follower_url}/read", params={"key": "test_key"})
        assert response.status_code == 200, f"Read from follower {i+1} failed: {response.text}"
        assert response.json()["value"] == "test_value", f"Value mismatch on follower {i+1}"
    print("✓ Read from all followers successful")


def test_concurrent_writes():
    """Test concurrent write operations."""
    print("\n=== Test 2: Concurrent Writes ===")
    
    def write_key(i):
        response = requests.post(f"{LEADER_URL}/write", json={"key": f"key_{i}", "value": f"value_{i}"})
        return response.status_code == 200
    
    num_writes = 100
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(write_key, range(num_writes)))
    
    successful_writes = sum(results)
    print(f"✓ {successful_writes}/{num_writes} concurrent writes successful")
    assert successful_writes == num_writes, "Some writes failed"
    
    # Give time for replication
    time.sleep(2)


def test_replication_consistency():
    """Test that data is consistent across leader and followers."""
    print("\n=== Test 3: Replication Consistency ===")
    
    # Get all data from the leader
    response = requests.get(f"{LEADER_URL}/data")
    leader_data = response.json()
    print(f"Leader has {len(leader_data)} keys")
    
    # Check each follower
    for i, follower_url in enumerate(FOLLOWER_URLS):
        response = requests.get(f"{follower_url}/data")
        follower_data = response.json()
        print(f"Follower {i+1} has {len(follower_data)} keys")
        
        # Check if the follower has at least the data (might have more due to async nature)
        missing_keys = set(leader_data.keys()) - set(follower_data.keys())
        if missing_keys:
            print(f"  ⚠ Follower {i+1} is missing {len(missing_keys)} keys")
        else:
            print(f"  ✓ Follower {i+1} has all leader keys")
        
        # Check value consistency for common keys
        for key in leader_data:
            if key in follower_data:
                assert leader_data[key] == follower_data[key], \
                    f"Value mismatch for key {key} on follower {i+1}"


def test_write_with_concurrent_reads():
    """Test concurrent reads while writes are happening."""
    print("\n=== Test 4: Concurrent Writes and Reads ===")
    
    def write_keys():
        for i in range(50):
            requests.post(f"{LEADER_URL}/write", json={"key": f"rw_key_{i}", "value": f"value_{i}"})
    
    def read_keys():
        for i in range(50):
            try:
                requests.get(f"{LEADER_URL}/read", params={"key": f"rw_key_{i}"})
            except Exception:
                pass  # Key might not exist yet
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        write_future = executor.submit(write_keys)
        read_futures = [executor.submit(read_keys) for _ in range(3)]
        
        write_future.result()
        for future in read_futures:
            future.result()
    
    print("✓ Concurrent reads and writes completed without deadlock")


def run_all_tests():
    """Run all integration tests."""
    print("=" * 60)
    print("INTEGRATION TESTS FOR DISTRIBUTED KEY-VALUE STORE")
    print("=" * 60)
    
    if not wait_for_services():
        print("ERROR: Services did not start in time")
        sys.exit(1)
    
    try:
        test_write_and_read()
        test_concurrent_writes()
        test_replication_consistency()
        test_write_with_concurrent_reads()
        
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED ✓")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
