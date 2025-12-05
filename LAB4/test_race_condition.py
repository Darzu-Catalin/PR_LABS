#!/usr/bin/env python3
"""
Test script to demonstrate race condition handling with versioning.
Tests that concurrent writes to the same key result in consistent data across replicas.
"""

import requests
import time
from concurrent.futures import ThreadPoolExecutor
import sys

LEADER_URL = "http://localhost:8000"
FOLLOWER_URLS = [f"http://localhost:{8001 + i}" for i in range(5)]


def wait_for_services():
    """Wait for all services to be ready."""
    print("Waiting for services...")
    for _ in range(30):
        try:
            all_healthy = all(
                requests.get(f"{url}/health", timeout=1).status_code == 200
                for url in [LEADER_URL] + FOLLOWER_URLS
            )
            if all_healthy:
                print("✓ All services ready\n")
                return True
        except:
            pass
        time.sleep(1)
    return False


def concurrent_write_test():
    """Test concurrent writes to the same key."""
    print("=" * 70)
    print("TEST: Concurrent Writes to Same Key (Race Condition Test)")
    print("=" * 70)
    
    key = "user:123:name"
    values = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry"]
    
    print(f"\nWriting {len(values)} different values to key '{key}' concurrently...")
    print(f"Values: {values}\n")
    
    def write_value(value):
        """Perform a write and return the response."""
        response = requests.post(
            f"{LEADER_URL}/write",
            json={"key": key, "value": value}
        )
        if response.status_code == 200:
            data = response.json()
            print(f"  Write '{value}' → version {data.get('version')}")
            return data.get('version')
        return None
    
    # Execute concurrent writes
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=len(values)) as executor:
        versions = list(executor.map(write_value, values))
    
    elapsed = time.time() - start_time
    print(f"\nCompleted {len(values)} concurrent writes in {elapsed:.3f}s")
    print(f"Version numbers assigned: {sorted([v for v in versions if v])}")
    
    # Wait for replication to complete
    print("\nWaiting 2 seconds for replication to complete...")
    time.sleep(2)
    
    # Check consistency across all nodes
    print("\n" + "-" * 70)
    print("Checking data consistency across all replicas:")
    print("-" * 70)
    
    # Read from leader
    response = requests.get(f"{LEADER_URL}/read", params={"key": key})
    if response.status_code == 200:
        leader_data = response.json()
        print(f"\nLeader:    value='{leader_data['value']}', version={leader_data['version']}")
    else:
        print(f"\n❌ Leader read failed")
        return False
    
    # Read from all followers
    all_consistent = True
    for i, follower_url in enumerate(FOLLOWER_URLS):
        response = requests.get(f"{follower_url}/read", params={"key": key})
        if response.status_code == 200:
            follower_data = response.json()
            is_consistent = (
                follower_data['value'] == leader_data['value'] and
                follower_data['version'] == leader_data['version']
            )
            
            status = "✓" if is_consistent else "✗"
            print(f"Follower{i+1}: value='{follower_data['value']}', version={follower_data['version']} {status}")
            
            if not is_consistent:
                all_consistent = False
        else:
            print(f"Follower{i+1}: ❌ Read failed")
            all_consistent = False
    
    print("\n" + "=" * 70)
    if all_consistent:
        print("✓ SUCCESS: All replicas have consistent data!")
        print(f"  Final value: '{leader_data['value']}' (version {leader_data['version']})")
        print("\nExplanation:")
        print("  - Each write received a monotonically increasing version number")
        print("  - Followers received replication requests in random order (network delay)")
        print("  - Followers only accepted writes with HIGHER version numbers")
        print("  - Result: All followers converged to the highest version (latest write)")
    else:
        print("✗ FAILURE: Data inconsistency detected!")
        print("  Some followers have different versions - versioning not working correctly")
    print("=" * 70)
    
    return all_consistent


def multiple_keys_test():
    """Test concurrent writes to multiple keys."""
    print("\n\n" + "=" * 70)
    print("TEST: Concurrent Writes to Multiple Keys")
    print("=" * 70)
    
    num_writes = 50
    num_keys = 10
    
    print(f"\nPerforming {num_writes} concurrent writes across {num_keys} keys...")
    
    def write_operation(i):
        key = f"key_{i % num_keys}"
        value = f"value_{i}"
        response = requests.post(
            f"{LEADER_URL}/write",
            json={"key": key, "value": value}
        )
        return response.status_code == 200
    
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(write_operation, range(num_writes)))
    
    elapsed = time.time() - start_time
    successful = sum(results)
    
    print(f"Completed: {successful}/{num_writes} writes successful in {elapsed:.3f}s")
    
    # Wait for replication
    print("\nWaiting 2 seconds for replication...")
    time.sleep(2)
    
    # Check consistency for each key
    print("\nChecking consistency for all keys:")
    
    inconsistencies = []
    for key_num in range(num_keys):
        key = f"key_{key_num}"
        
        # Get from leader
        response = requests.get(f"{LEADER_URL}/read", params={"key": key})
        if response.status_code != 200:
            continue
        leader_data = response.json()
        
        # Check each follower
        for i, follower_url in enumerate(FOLLOWER_URLS):
            response = requests.get(f"{follower_url}/read", params={"key": key})
            if response.status_code == 200:
                follower_data = response.json()
                if follower_data['version'] != leader_data['version']:
                    inconsistencies.append(
                        f"  Key '{key}': Follower{i+1} version={follower_data['version']}, "
                        f"Leader version={leader_data['version']}"
                    )
    
    if not inconsistencies:
        print("✓ All keys are consistent across all replicas!")
    else:
        print(f"✗ Found {len(inconsistencies)} inconsistencies:")
        for inc in inconsistencies[:5]:  # Show first 5
            print(inc)
    
    print("=" * 70)
    
    return len(inconsistencies) == 0


def main():
    """Run all race condition tests."""
    if not wait_for_services():
        print("❌ Services not ready")
        sys.exit(1)
    
    print("\n🧪 RACE CONDITION TESTING WITH VERSIONING\n")
    
    test1_passed = concurrent_write_test()
    test2_passed = multiple_keys_test()
    
    print("\n\n" + "=" * 70)
    print("FINAL RESULTS")
    print("=" * 70)
    print(f"Test 1 (Same Key Race):      {'✓ PASSED' if test1_passed else '✗ FAILED'}")
    print(f"Test 2 (Multiple Keys):      {'✓ PASSED' if test2_passed else '✗ FAILED'}")
    print("=" * 70)
    
    if test1_passed and test2_passed:
        print("\n✓ ALL TESTS PASSED!")
        print("\nVersioning successfully resolves race conditions:")
        print("  - Lamport timestamps ensure total ordering of writes")
        print("  - Followers reject stale updates (lower version numbers)")
        print("  - All replicas converge to the same final state")
    else:
        print("\n✗ SOME TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
