import os
import time
import random
import requests
from flask import Flask, request, jsonify
from threading import Lock, Thread
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory key-value store with versioning {key: {"value": value, "version": version_number}}
data_store = {}
store_lock = Lock()

# Global version counter (Lamport timestamp)
version_counter = 0
version_lock = Lock()

# Configuration from env variables
WRITE_QUORUM = int(os.getenv('WRITE_QUORUM', 3))
MIN_DELAY = float(os.getenv('MIN_DELAY', 0.0001))  # 500ms, 0.0001 for 0.1ms
MAX_DELAY = float(os.getenv('MAX_DELAY', 1))   # 1000ms
PORT = int(os.getenv('PORT', 5000))

# Follower nodes
FOLLOWERS = [
    f"http://follower{i}:5000" for i in range(1, 6)
]

logger.info(f"Leader starting with WRITE_QUORUM={WRITE_QUORUM}, MIN_DELAY={MIN_DELAY}, MAX_DELAY={MAX_DELAY}")


def replicate_to_follower(follower_url, key, value, version):
    """Replicate a write to a single follower with simulated network delay."""
    # Simulate network lag
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    time.sleep(delay)
    
    try:
        response = requests.post(
            f"{follower_url}/replicate",
            json={"key": key, "value": value, "version": version},
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Failed to replicate to {follower_url}: {e}")
        return False


def replicate_to_followers(key, value, version):
    """
    Replicate to followers concurrently using semi-synchronous replication.
    Returns True if at least WRITE_QUORUM followers acknowledge the write.
    """
    successful_replications = 0
    failed_replications = 0
    total_followers = len(FOLLOWERS)
    
    executor = ThreadPoolExecutor(max_workers=total_followers)
    start_time = time.time()

    # Use ThreadPoolExecutor for concurrent replication
    try:
        # Submit all replication tasks concurrently
        future_to_follower = {
            executor.submit(replicate_to_follower, follower, key, value, version): follower 
            for follower in FOLLOWERS
        }
        
        # Wait for futures to complete and count successes
        for future in as_completed(future_to_follower):
            follower = future_to_follower[future]
            try:
                if future.result():
                    successful_replications += 1
                    logger.debug(f"Successfully replicated to {follower}")

                    # Early return: quorum reached
                    if successful_replications >= WRITE_QUORUM:
                        elapsed = (time.time() - start_time) * 1000  # ms
                        logger.info(f"Write quorum met ({successful_replications}/{WRITE_QUORUM}) in {elapsed:.2f}ms")
                        return True
                else:
                    failed_replications += 1
                    logger.warning(f"Failed to replicate to {follower}")
            except Exception as e:
                failed_replications += 1
                logger.error(f"Exception while replicating to {follower}: {e}")

            remaining = total_followers - (successful_replications + failed_replications)
            if successful_replications + remaining < WRITE_QUORUM:
                logger.error(f"Write quorum impossible to reach ({successful_replications} success, "
                           f"{failed_replications} failed, {remaining} pending)")
                return False
        
        return successful_replications >= WRITE_QUORUM
    
    finally:
        # Clean up executor (don't wait for remaining tasks)
        executor.shutdown(wait=False)


@app.route('/write', methods=['POST'])
def write():
    """Write endpoint - only accepts writes on the leader."""
    global version_counter
    
    data = request.get_json()
    key = data.get('key')
    value = data.get('value')
    
    if key is None or value is None:
        return jsonify({"error": "key and value are required"}), 400
    
    # Increment version counter (Lamport timestamp)
    with version_lock:
        version_counter += 1
        current_version = version_counter
    
    # Write to leader's store with the version
    with store_lock:
        data_store[key] = {
            "value": value,
            "version": current_version
        }
    
    # Replicate to followers (semi-synchronous) with the version
    if replicate_to_followers(key, value, current_version):
        logger.info(f"Write successful for key={key}, value={value}, version={current_version}")
        return jsonify({"status": "success", "key": key, "value": value, "version": current_version}), 200
    else:
        # Replication didn't meet quorum, but data is already written to leader
        logger.warning(f"Write quorum not met for key={key}, but data written to leader")
        return jsonify({"status": "partial_success", "key": key, "value": value, "version": current_version,
                       "warning": "Write quorum not met"}), 200


@app.route('/read', methods=['GET'])
def read():
    """Read endpoint - returns the value for a given key."""
    key = request.args.get('key')
    
    if key is None:
        return jsonify({"error": "key parameter is required"}), 400
    
    with store_lock:
        data = data_store.get(key)
    
    if data is None:
        return jsonify({"error": "key not found"}), 404
    
    return jsonify({"key": key, "value": data["value"], "version": data["version"]}), 200


@app.route('/data', methods=['GET'])
def get_all_data():
    """Return all data in the store (for testing/verification)."""
    with store_lock:
        return jsonify(data_store.copy()), 200


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "role": "leader"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, threaded=True)
