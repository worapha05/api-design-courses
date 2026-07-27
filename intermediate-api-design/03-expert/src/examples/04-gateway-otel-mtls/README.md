# 04 — Gateway + Tracing + mTLS

```bash
# (optional) สร้าง cert แล้ว server/gateway จะเปิด mTLS อัตโนมัติ
bash 03-expert/examples/04-gateway-otel-mtls/generate-certs.sh

node 03-expert/examples/04-gateway-otel-mtls/grpc-server.js
node 03-expert/examples/04-gateway-otel-mtls/gateway.js

curl -s http://localhost:8088/orders/ord-100 | jq
curl -s -X POST http://localhost:8088/orders \
  -H 'content-type: application/json' \
  -d '{"customer":"Bee","total":990}' | jq
```

สังเกต header ตอบกลับ `x-trace-id` และ log ฝั่ง gRPC ที่พิมพ์ trace เดียวกัน
