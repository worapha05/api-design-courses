# 03 — gRPC Performance / HTTP/2

```bash
node 03-expert/examples/03-grpc-performance-http2/server.js
node 03-expert/examples/03-grpc-performance-http2/client.js
```

สังเกตเวลา: การสร้าง client ใหม่ทุกครั้ง vs reuse + parallel Metadata `x-trace-id` จำลองการ
propagate trace ข้าม RPC
