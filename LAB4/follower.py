import os
import signal
import sys
from flask import Flask, request, jsonify
from threading import Lock
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory key-value store with versioning {key: {"value": value, "version": version_number}}
data_store = {}
store_lock = Lock()

# Configuration from env variables
PORT = int(os.getenv('PORT', 5000))
FOLLOWER_ID = os.getenv('FOLLOWER_ID', 'unknown')

logger.info(f"Follower {FOLLOWER_ID} starting on port {PORT}")


@app.route('/replicate', methods=['POST'])
def replicate():
    """Receive a replication request from the leader."""
    data = request.get_json()
    key = data.get('key')
    value = data.get('value')
    version = data.get('version')
    
    if key is None or value is None or version is None:
        return jsonify({"error": "key, value, and version are required"}), 400
    
    # Write to the follower's store with version control
    with store_lock:
        existing_data = data_store.get(key)
        
        # Only update if the version is higher (resolves out-of-order replication)
        if existing_data is None or version > existing_data["version"]:
            data_store[key] = {
                "value": value,
                "version": version
            }
            logger.debug(f"Replicated key={key}, value={value}, version={version}")
            return jsonify({"status": "success", "updated": True}), 200
        else:
            logger.debug(f"Ignored stale replication for key={key}, incoming version={version}, current version={existing_data['version']}")
            return jsonify({"status": "success", "updated": False, "reason": "stale_version"}), 200


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
    return jsonify({"status": "healthy", "role": "follower", "id": FOLLOWER_ID}), 200


def signal_handler(sig, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Follower {FOLLOWER_ID} shutting down...")
    sys.exit(0)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    app.run(host='0.0.0.0', port=PORT, threaded=True)
