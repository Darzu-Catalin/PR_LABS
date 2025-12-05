# Quick Start Guide

## 1. Start the Cluster

```bash
./run.sh start
```

Wait for all services to be healthy (about 10 seconds).

## 2. Verify Services are Running

```bash
./run.sh status
```

You should see all services marked as healthy.

## 3. Try the Example Usage

```bash
python3 example_usage.py
```

This will:
- Write some key-value pairs to the leader
- Read them from all nodes (leader and followers)
- Check data consistency across replicas

## 4. Manual API Testing

### Write a value
```bash
curl -X POST http://localhost:8000/write \
  -H "Content-Type: application/json" \
  -d '{"key": "greeting", "value": "Hello World"}'
```

### Read from leader
```bash
curl http://localhost:8000/read?key=greeting
```

### Read from a follower
```bash
curl http://localhost:8001/read?key=greeting
```

### Get all data
```bash
curl http://localhost:8000/data
```

## 5. Run Integration Tests

```bash
./run.sh test
```

This runs comprehensive tests including:
- Basic write/read operations
- Concurrent writes
- Replication consistency
- Concurrent reads and writes

## 6. Run Performance Analysis (Optional)

⚠️ **Warning**: This takes 1-2 minutes to complete!

```bash
./run.sh analyze
```

This will:
- Test write quorum values from 1 to 5
- Perform 10,000 concurrent writes for each quorum
- Measure and plot latency vs quorum
- Check data consistency after writes
- Generate a graph (`performance_analysis.png`)

## 7. Stop the Cluster

```bash
./run.sh stop
```

## Troubleshooting

### Services won't start
```bash
# Check logs
./run.sh logs

# Clean and restart
./run.sh clean
./run.sh start
```

### Port conflicts
Edit `docker-compose.yml` and change the port mappings.

### Python dependencies missing
```bash
pip install -r requirements.txt
```

## Understanding Write Quorum

The `WRITE_QUORUM` setting determines how many followers must acknowledge a write before it's considered successful.

- **Quorum = 1**: Fast writes, weaker consistency
- **Quorum = 3**: Balanced (default)
- **Quorum = 5**: Slowest writes, strongest consistency

To change the quorum, edit the `WRITE_QUORUM` value in `docker-compose.yml` and restart:

```yaml
environment:
  - WRITE_QUORUM=5  # Require all 5 followers
```

```bash
./run.sh restart
```

## Next Steps

1. Read the full [README.md](README.md) for detailed documentation
2. Study the implementation in `leader.py` and `follower.py`
3. Run the performance analysis to see the latency vs consistency trade-offs
4. Experiment with different write quorum values
5. Try simulating failures (stop a follower container)
