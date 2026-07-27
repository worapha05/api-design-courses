# 04 — gRPC-Web + Envoy

```bash
# terminal 1 — backend
node 02-intermediate/examples/04-grpc-web/server.js

# terminal 2 — จาก bootcamp root
docker compose up -d

# ตรวจ
node 02-intermediate/examples/04-grpc-web/web-client.js
```

สถาปัตยกรรม:

```
Browser / gRPC-Web client → Envoy :8080 → Greeter gRPC :50053
```

ไฟล์ `envoy.yaml` เปิด `grpc_web` filter + CORS ใน project จริง สร้าง stub ด้วย `protoc` +
`protoc-gen-grpc-web` แล้วชี้ host ไปที่ Envoy
