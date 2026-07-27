# PulseBoard Lab — Solution

```bash
# terminal 1 — GraphQL + Subscriptions + DataLoader
node graphql-server.js

# terminal 2 — gRPC telemetry stream
node grpc-telemetry.js

# terminal 3 — bridge: อ่าน stream แล้ว push เข้า GraphQL
node bridge.js

# ทดสอบ subscription ด้วย script (optional)
node subscribe-demo.js
```

| ไฟล์                | หน้าที่                           |
| ------------------- | --------------------------------- |
| `store.js`          | devices + metrics + counters      |
| `pulse.proto`       | WatchMetrics                      |
| `graphql-server.js` | Query/Mutation/Subscription :4002 |
| `grpc-telemetry.js` | gRPC stream :50054                |
| `bridge.js`         | stream → HTTP mutation            |
| `subscribe-demo.js` | WS client ทดสอบ                   |
| `NOTES.md`          | คำตอบ                             |
