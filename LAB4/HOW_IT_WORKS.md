# How LAB4 Works - Distributed Key-Value Store

**Author:** Catalin Darzuca  
**Date:** December 5, 2025

---

## 🎯 Overview

This lab implements a **distributed key-value store** using a **leader-follower replication** architecture, similar to the Raft consensus algorithm. The system ensures data consistency across multiple nodes while handling concurrent operations.

---

## 🏗️ System Architecture

```
                    ┌─────────────────┐
                    │   CLIENT        │
                    │  (Your App)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   LEADER        │
                    │  Port 8000      │
                    │  SQLite DB      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  FOLLOWER 1  │    │  FOLLOWER 2  │    │  FOLLOWER 3  │
│  Port 8001   │    │  Port 8002   │    │  Port 8003   │
│  SQLite DB   │    │  SQLite DB   │    │  SQLite DB   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐
│  FOLLOWER 4  │    │  FOLLOWER 5  │
│  Port 8004   │    │  Port 8005   │
│  SQLite DB   │    │  SQLite DB   │
└──────────────┘    └──────────────┘
```

---

## 🔑 Key Components

### 1. **Leader Node** (`leader.py`)

The leader is the **coordinator** of the entire system:

- **Accepts all write requests** from clients
- **Stores data locally** in SQLite database
- **Replicates data** to all followers in parallel
- **Waits for quorum** before confirming write success
- **Handles read requests** from its own database

**Key Methods:**

```python
@app.post("/write")
async def write(key: str, value: str):
    # 1. Store locally in leader's database
    # 2. Send to all followers in parallel
    # 3. Wait for WRITE_QUORUM acknowledgments
    # 4. Return success if quorum reached
```

### 2. **Follower Nodes** (`follower.py`)

Each follower is an **independent replica**:

- **Receives replicated writes** from the leader
- **Stores data locally** in its own SQLite database
- **Handles read requests** independently
- **No communication** with other followers

**Key Methods:**

```python
@app.post("/replicate")
async def replicate(key: str, value: str):
    # 1. Store data in local database
    # 2. Send acknowledgment to leader
    
@app.get("/read")
async def read(key: str):
    # Return value from local database
```

### 3. **SQLite Database**

Each node has its **own database file**:
- Leader: `/data/leader.db`
- Followers: `/data/follower.db`

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS kvstore (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

---

## 📊 How Operations Work

### ✍️ Write Operation Flow

```
1. Client sends: POST /write {"key": "name", "value": "Catalin"}
                     │
2. Leader receives request
                     │
3. Leader stores in local DB: name → Catalin
                     │
4. Leader replicates to ALL 5 followers in parallel
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
   Follower1     Follower2     Follower3  (and 4, 5...)
   stores data   stores data   stores data
      │              │              │
      └──────────────┼──────────────┘
                     │
5. Leader waits for WRITE_QUORUM acknowledgments
                     │
6. If quorum reached → return success ✓
   If not → return error (503) ✗
```

**Example with WRITE_QUORUM = 3:**
- Leader sends to 5 followers
- Waits for 3 acknowledgments
- If 3+ respond → Success
- If less than 3 respond → Failure

### 📖 Read Operation Flow

```
1. Client sends: GET /read?key=name
                     │
2. Any node (leader or follower) receives request
                     │
3. Node reads from its local database
                     │
4. Returns value: "Catalin"
```

**Important:** Reads are **independent** - no coordination needed!

---

## 🎚️ Write Quorum Explained

The **WRITE_QUORUM** setting controls the **consistency vs performance trade-off**.

### What is Quorum?

Quorum = **minimum number of followers** that must acknowledge a write before it's considered successful.

### Trade-offs:

| Quorum | Speed | Consistency | Fault Tolerance |
|--------|-------|-------------|-----------------|
| 1      | ⚡ Very Fast | ⚠️ Weakest | Can lose 4 followers |
| 3      | ⚖️ Balanced | ✓ Good | Can lose 2 followers |
| 5      | 🐌 Slowest | ✅ Strongest | No followers can fail |

### Example Scenarios:

**WRITE_QUORUM = 1:**
```
Leader writes → Waits for just 1 follower → Returns success
✓ Fast! But if leader crashes, data might not be on all nodes
```

**WRITE_QUORUM = 3:**
```
Leader writes → Waits for 3 followers → Returns success
⚖️ Balanced! Data is on at least 3 nodes before confirming
```

**WRITE_QUORUM = 5:**
```
Leader writes → Waits for ALL 5 followers → Returns success
✅ Safest! Data is on all nodes before confirming
```

---

## 🔄 Replication Process

### Step-by-Step:

1. **Leader receives write request**
   ```python
   POST /write {"key": "user:1", "value": "Alice"}
   ```

2. **Leader stores locally**
   ```sql
   INSERT INTO kvstore VALUES ('user:1', 'Alice')
   ```

3. **Leader creates replication tasks** (parallel)
   ```python
   tasks = [
       replicate_to_follower('follower1', key, value),
       replicate_to_follower('follower2', key, value),
       replicate_to_follower('follower3', key, value),
       replicate_to_follower('follower4', key, value),
       replicate_to_follower('follower5', key, value),
   ]
   ```

4. **Waits for results**
   ```python
   results = await asyncio.gather(*tasks, return_exceptions=True)
   successes = count_successful_responses(results)
   ```

5. **Checks quorum**
   ```python
   if successes >= WRITE_QUORUM:
       return {"status": "success"}
   else:
       raise HTTPException(503, "Quorum not reached")
   ```

---

## 🧪 Concurrency & Race Conditions

### Problem: What if two clients write at the same time?

**Scenario:**
```
Client A: POST /write {"key": "counter", "value": "1"}
Client B: POST /write {"key": "counter", "value": "2"}
```

### Solution: SQLite's REPLACE Operation

```python
cursor.execute("REPLACE INTO kvstore (key, value) VALUES (?, ?)", 
               (key, value))
```

**REPLACE = INSERT or UPDATE:**
- If key doesn't exist → INSERT
- If key exists → UPDATE (overwrite)

**Last Write Wins:**
- Both writes execute
- Whichever arrives last at each node is the final value
- Eventually all nodes converge to the same value

### Async Handling

```python
@app.post("/write")
async def write(key: str, value: str):
    # Python's async/await handles multiple concurrent requests
    # Each request gets its own task
    # No blocking - server can handle many requests at once
```

---

## 📡 Communication Protocol

### HTTP/JSON API

All communication uses simple HTTP with JSON:

**Write to Leader:**
```bash
curl -X POST http://localhost:8000/write \
  -H "Content-Type: application/json" \
  -d '{"key": "name", "value": "Catalin"}'
```

**Leader to Follower (internal replication):**
```bash
curl -X POST http://follower1:8001/replicate \
  -H "Content-Type: application/json" \
  -d '{"key": "name", "value": "Catalin"}'
```

**Read from Any Node:**
```bash
curl http://localhost:8001/read?key=name
```

**Response Format:**
```json
{
  "key": "name",
  "value": "Catalin",
  "node": "follower1"
}
```

---

## 🐳 Docker Deployment

### Why Docker?

- **Isolation:** Each node runs in its own container
- **Networking:** Containers can communicate via Docker network
- **Scalability:** Easy to add more followers
- **Consistency:** Same environment everywhere

### Container Setup:

```yaml
services:
  leader:
    image: lab4-leader
    ports: ["8000:8000"]
    environment:
      - WRITE_QUORUM=3
    
  follower1:
    image: lab4-follower1
    ports: ["8001:8001"]
```

### Data Persistence:

Each container has a volume for SQLite database:
```yaml
volumes:
  - ./data/leader:/data
```

---

## 🔍 Consistency Model

### Eventual Consistency

This system uses **eventual consistency**:

**What it means:**
- Writes propagate to followers **asynchronously**
- Followers might have **slightly stale data** for a brief moment
- Eventually (usually milliseconds), **all nodes converge** to the same state

**Example Timeline:**
```
T=0ms:  Client writes "name=Catalin" to leader
T=1ms:  Leader stores locally
T=2ms:  Leader sends to all followers
T=5ms:  3 followers acknowledge (quorum reached)
T=5ms:  Leader returns success to client
T=10ms: Remaining 2 followers acknowledge
T=10ms: All 6 nodes have identical data ✓
```

**Reading during replication:**
```
T=6ms:  Client reads from follower4 → might get old value
T=11ms: Client reads from follower4 → gets new value ✓
```

### Strong Consistency (with higher quorum)

With **WRITE_QUORUM = 5**, you get **stronger consistency**:
- All 5 followers must acknowledge
- Any read from any follower will see the write
- Slower but more predictable

---

## ⚡ Performance Characteristics

### Latency Factors:

1. **Network delay:** Time to send data to followers
2. **Database write:** Time to insert into SQLite (~1ms)
3. **Quorum wait:** Time to wait for N acknowledgments

### Typical Performance:

| Operation | Latency | Notes |
|-----------|---------|-------|
| Read | ~5ms | Local DB query, very fast |
| Write (Quorum=1) | ~20ms | Wait for 1 follower |
| Write (Quorum=3) | ~30ms | Wait for 3 followers |
| Write (Quorum=5) | ~50ms | Wait for all followers |

### Concurrent Operations:

- **Reads:** Highly scalable (6 nodes can serve reads)
- **Writes:** Limited by leader capacity
- **Tested:** 100 concurrent writes without issues

---

## 🛡️ Fault Tolerance

### Failure Scenarios:

**1. Follower Crashes:**
```
5 followers, WRITE_QUORUM=3
→ 1 follower crashes
→ System still works (4 remaining > 3 needed)
```

**2. Multiple Followers Crash:**
```
5 followers, WRITE_QUORUM=3
→ 3 followers crash
→ System fails (2 remaining < 3 needed)
```

**3. Leader Crashes:**
```
→ System stops accepting writes
→ Followers can still serve reads
→ Need leader election (not implemented in this lab)
```

### Quorum Math:

To tolerate F failures, need:
```
Total Followers = F + Quorum
```

Examples:
- Tolerate 2 failures with Quorum=3 → Need 5 followers ✓
- Tolerate 1 failure with Quorum=5 → Need 6 followers

---

## 🎓 Key Learning Points

### 1. Distributed Consensus
- Multiple nodes must agree on data
- Quorum-based consensus is simple and effective
- Trade-off between speed and consistency

### 2. Replication Strategies
- **Synchronous:** Wait for all replicas (slow, consistent)
- **Asynchronous:** Don't wait (fast, eventually consistent)
- **Quorum:** Middle ground (configurable)

### 3. CAP Theorem Application
- **C**onsistency: Configurable via quorum
- **A**vailability: Works if quorum reachable
- **P**artition tolerance: Can handle some node failures

### 4. Async Programming
- Python's `async/await` for concurrent operations
- Non-blocking I/O for network calls
- Parallel replication to multiple followers

### 5. Database Design
- SQLite for simple key-value storage
- REPLACE for upsert operations
- Each node has independent database

---

## 🔧 Configuration Options

### Environment Variables:

```yaml
WRITE_QUORUM: 3          # Number of followers that must acknowledge
FOLLOWER_URLS: ["http://follower1:8001", ...]
PORT: 8000               # Port to listen on
```

### Changing Quorum:

Edit `docker-compose.yml`:
```yaml
environment:
  - WRITE_QUORUM=5  # Require all 5 followers
```

Then restart:
```bash
./run.sh restart
```

---

## 📈 Testing & Validation

### Integration Tests:

1. **Basic Write/Read:** Verify single operation
2. **Concurrent Writes:** Test 100 parallel writes
3. **Replication Consistency:** Check all nodes have same data
4. **Concurrent Read/Write:** Test no deadlocks

### Performance Analysis:

```bash
./run.sh analyze
```

This measures:
- Write latency vs quorum size
- Throughput under load
- Consistency verification

Generates graph: `performance_analysis.png`

---

## 🚀 Real-World Applications

This architecture is used in:

- **Apache Cassandra:** Distributed database with tunable consistency
- **Etcd:** Kubernetes configuration store (uses Raft)
- **Apache Kafka:** Message broker with replication
- **MongoDB:** Document database with replica sets
- **Redis Cluster:** In-memory data store with replication

---

## 📚 Further Reading

- [Raft Consensus Algorithm](https://raft.github.io/)
- [CAP Theorem Explained](https://en.wikipedia.org/wiki/CAP_theorem)
- [Distributed Systems Patterns](https://martinfowler.com/articles/patterns-of-distributed-systems/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

---

## 🎯 Summary

**LAB4 demonstrates:**

✅ Leader-follower replication  
✅ Quorum-based consensus  
✅ Eventual consistency  
✅ Fault tolerance  
✅ Concurrent request handling  
✅ Docker containerization  
✅ RESTful API design  
✅ Async programming with Python  

**Key Insight:** By adjusting the write quorum, you can **tune the trade-off** between **speed** (lower quorum) and **consistency** (higher quorum) to match your application's needs.

---

**Created by:** Catalin Darzuca  
**Date:** December 5, 2025  
**Lab:** PR LAB4 - Distributed Systems
