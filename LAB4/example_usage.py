#!/usr/bin/env python3
"""
Example usage script for the distributed key-value store.
Demonstrates basic operations: write, read, and checking data consistency.
"""

import requests
import time
import sys

LEADER_URL = "http://localhost:8000"
FOLLOWER_URLS = [f"http://localhost:{8001 + i}" for i in range(5)]


def check_services():
    """Check if all services are running."""
    print("Checking if services are running...")
    
    all_healthy = True
    for url in [LEADER_URL] + FOLLOWER_URLS:
        try:
            response = requests.get(f"{url}/health", timeout=2)
            if response.status_code == 200:
                data = response.json()
                print(f"  ✓ {url} - {data.get('role', 'unknown')}")
            else:
                print(f"  ✗ {url} - unhealthy")
                all_healthy = False
        except Exception as e:
            print(f"  ✗ {url} - {e}")
            all_healthy = False
    
    return all_healthy


def write_data(key, value):
    """Write a key-value pair to the leader."""
    print(f"\nWriting: {key} = {value}")
    
    try:
        response = requests.post(
            f"{LEADER_URL}/write",
            json={"key": key, "value": value},
            timeout=5
        )
        
        if response.status_code == 200:
            print(f"  ✓ Write successful")
            return True
        else:
            print(f"  ✗ Write failed: {response.text}")
            return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False


def read_data(url, key):
    """Read a value from a given URL."""
    try:
        response = requests.get(f"{url}/read", params={"key": key}, timeout=2)
        
        if response.status_code == 200:
            value = response.json()["value"]
            return value
        elif response.status_code == 404:
            return None
        else:
            return f"Error: {response.text}"
    except Exception as e:
        return f"Error: {e}"


def read_from_all(key):
    """Read a key from leader and all followers."""
    print(f"\nReading '{key}' from all nodes:")
    
    # Read from the leader
    value = read_data(LEADER_URL, key)
    print(f"  Leader:    {value}")
    
    # Read from followers
    for i, follower_url in enumerate(FOLLOWER_URLS):
        value = read_data(follower_url, key)
        print(f"  Follower{i+1}: {value}")


def get_all_data(url):
    """Get all data from a given URL."""
    try:
        response = requests.get(f"{url}/data", timeout=2)
        if response.status_code == 200:
            return response.json()
        return {}
    except Exception:
        return {}


def check_consistency():
    """Check data consistency across all nodes."""
    print("\nChecking data consistency:")
    
    # Get leader data
    leader_data = get_all_data(LEADER_URL)
    print(f"  Leader has {len(leader_data)} keys")
    
    # Check each follower
    for i, follower_url in enumerate(FOLLOWER_URLS):
        follower_data = get_all_data(follower_url)
        
        matching = sum(1 for k, v in leader_data.items() if follower_data.get(k) == v)
        missing = len(leader_data) - len([k for k in leader_data if k in follower_data])
        
        consistency = (matching / len(leader_data) * 100) if leader_data else 100
        print(f"  Follower{i+1}: {len(follower_data)} keys, {consistency:.1f}% consistent, {missing} missing")


def main():
    """Main demonstration function."""
    print("=" * 60)
    print("Distributed Key-Value Store - Example Usage")
    print("=" * 60)
    
    # Check if services are running
    if not check_services():
        print("\n❌ Some services are not running. Please start the cluster first:")
        print("   ./run.sh start")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("Demonstration")
    print("=" * 60)
    
    # Write some data
    write_data("user:1:name", "Alice")
    write_data("user:1:email", "alice@example.com")
    write_data("user:2:name", "Bob")
    write_data("user:2:email", "bob@example.com")
    
    # Wait for replication
    print("\nWaiting for replication...")
    time.sleep(1)
    
    # Read from all nodes
    read_from_all("user:1:name")
    read_from_all("user:2:email")
    
    # Check consistency
    check_consistency()
    
    # Try reading a non-existent key
    print("\nTrying to read a non-existent key:")
    value = read_data(LEADER_URL, "non_existent_key")
    print(f"  Result: {value}")
    
    print("\n" + "=" * 60)
    print("Demonstration completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
