# System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                 │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │   Client 1   │   │   Client 2   │   │   Client N   │                 │
│  │  (Thread 1)  │   │  (Thread 2)  │   │  (Thread N)  │                 │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                 │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                     WRITE Requests                                      │
│                      (JSON over HTTP)                                   │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         LEADER NODE (Port 8000)                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Flask Web Server (Threaded)                                    │  │
│  │                                                                 │  │
│  │  POST /write  ──────┐                                           │  │
│  │  GET  /read         │  1. Write to local store                  │  │
│  │  GET  /data         │                                           │  │
│  │  GET  /health       │  2. Replicate concurrently ──────┐        │  │
│  │                     │     with network delay           │        │  │
│  │  ┌──────────────────▼────────────┐                     │        │  │
│  │  │   In-Memory Key-Value Store   │                     │        │  │
│  │  │         (Thread-Safe)         │                     │        │  │
│  │  └───────────────────────────────┘                     │        │  │
│  │                                                        │        │  │
│  │  ┌──────────────────────────────────────────────────┐  │        │  │
│  │  │  Replication Manager (ThreadPoolExecutor)        │  │        │  │
│  │  │  - Sends to all followers concurrently           │  │        │  │
│  │  │  - Simulates network delay (0.1ms - 1ms)         │◄─┘        │  │
│  │  │  - Waits for WRITE_QUORUM acknowledgments        │           │  │
│  │  │  - Returns success when quorum is met            │           │  │
│  │  └──────┬────────┬─────────────┬────────┬────────┬──┘           │  │
│  └─────────┼────────┼─────────────┼────────┼────────┼──────────────┘  │
└────────────┼────────┼─────────────┼────────┼────────┼─────────────────┘
             │        │             │        │        │
     Delay:  │0.3ms   │0.8ms        │0.2ms   │0.9ms   │0.5ms (random)
             │        │             │        │        │
    ┌────────▼────┐ ┌─▼──────┐ ┌────▼──┐ ┌───▼───┐ ┌──▼────┐
    │  Follower1  │ │ Foll.2 │ │ Foll.3│ │ Foll.4│ │ Foll.5│
    │  Port 8001  │ │  8002  │ │  8003 │ │  8004 │ │  8005 │
    └─────────────┘ └────────┘ └───────┘ └───────┘ └───────┘
            │              │         │         │         │
            │              │         │         │         │
            ▼              ▼         ▼         ▼         ▼
    ┌──────────────────────────────────────────────────────────┐
    │           FOLLOWER NODES (5 instances)                   │
    │  ┌────────────────────────────────────────────────────┐  │
    │  │  Flask Web Server (Threaded)                       │  │
    │  │                                                    │  │
    │  │  POST /replicate  ─────┐  (from leader)            │  │
    │  │  GET  /read            │                           │  │
    │  │  GET  /data            │                           │  │
    │  │  GET  /health          │                           │  │
    │  │                        │                           │  │
    │  │   ┌────────────────────▼──────────────┐            │  │
    │  │   │   In-Memory Key-Value Store       │            │  │
    │  │   │         (Thread-Safe)             │            │  │
    │  │   └───────────────────────────────────┘            │  │
    │  │                                                    │  │
    │  │  Returns: {"status": "success"}                    │  │
    │  └────────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────────┘
                             │
                             │ READ Requests
                             │ (from clients)
                             ▼
                      ┌──────────────┐
                      │   Clients    │
                      │ (can read    │
                      │  from any    │
                      │   replica)   │
                      └──────────────┘


WRITE FLOW (Semi-Synchronous Replication):
═══════════════════════════════════════════

1. Client sends WRITE to Leader
2. Leader writes to local store immediately
3. Leader sends replication to ALL followers concurrently (with delays)
4. Leader waits for WRITE_QUORUM followers to acknowledge
5. Once quorum met, Leader responds success to client
6. Remaining followers continue replication asynchronously


CONFIGURATION (Environment Variables):
═══════════════════════════════════════

┌────────────────────────────────────────────────────────────┐
│ WRITE_QUORUM  │  1-5  │  Number of required acknowledgments│
│ MIN_DELAY     │ 0.1ms │  Minimum network delay             │
│ MAX_DELAY     │  1ms  │  Maximum network delay             │
└────────────────────────────────────────────────────────────┘


QUORUM EXAMPLES:
════════════════

Quorum = 1:  Wait for 1 follower  ───────┐ Fast, weak consistency
Quorum = 3:  Wait for 3 followers ─────┐ │ Balanced (default)
Quorum = 5:  Wait for ALL followers  ┐ │ │ Slow, strong consistency
                                     │ │ │
    ┌────────────────────────────────┼─┼─┼──────────────────┐
    │ Followers:  F1  F2  F3  F4  F5 │ │ │                  │
    │                                │ │ │                  │
    │ Response:   OK  OK  OK  OK  OK │ │ │                  │
    │                 └───┴───┴───┴──┘ │ │                  │
    │                     Quorum = 5 ──┘ │                  │
    │                        Quorum = 3 ─┘                  │
    │                           Quorum = 1                  │
    └───────────────────────────────────────────────────────┘


NETWORK TOPOLOGY:
═════════════════

All containers run in a Docker bridge network:

    ┌─────────────────────────────────────────────────┐
    │          Docker Bridge Network                  │
    │                                                 │
    │  ┌────────┐  ┌────────┐  ┌────────┐             │
    │  │ leader │  │follower│  │follower│  ...        │
    │  │  :5000 │  │1 :5000 │  │2 :5000 │             │
    │  └────────┘  └────────┘  └────────┘             │
    │      │            │            │                │
    └──────┼────────────┼────────────┼────────────────┘
           │            │            │
    ┌──────┼────────────┼────────────┼───────────────┐
    │  Host Ports:  8000   8001       8002    ...    │
    └────────────────────────────────────────────────┘


PERFORMANCE TRADE-OFFS:
═══════════════════════

 Latency ▲
         │                                    ●  Quorum = 5
         │                              ●     
         │                         ●          
         │                    ●               
         │               ●                    Quorum = 1
         │          
         └───────────────────────────────────────────────►
                Write Quorum (1 → 5)

 Consistency ▲
 Guarantee   │                                ●  Quorum = 5
             │                           ●
             │                      ●
             │                 ●
             │            ●                    Quorum = 1
             │
             └───────────────────────────────────────────────►
                   Write Quorum (1 → 5)


This demonstrates the fundamental CAP theorem trade-off:
Cannot simultaneously maximize Consistency, Availability, and 
Partition Tolerance. Must choose where on the spectrum to operate.
```
