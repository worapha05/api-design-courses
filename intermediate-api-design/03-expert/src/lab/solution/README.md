# AetherEdge Lab — Solution

```bash
# optional mTLS
bash generate-certs.sh

node inventory-server.js
node gateway.js

curl -s -D - http://localhost:8088/items/sku-1 -o /tmp/item.json
cat /tmp/item.json

curl -s -X POST http://localhost:8088/items/sku-1/reserve \
  -H 'content-type: application/json' \
  -d '{"qty":1}'

curl -s http://localhost:8088/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ item(sku:\"sku-1\") { sku name quantity } }"}'
```

| ไฟล์                  | หน้าที่                           |
| --------------------- | --------------------------------- |
| `inventory.proto`     | contract                          |
| `inventory-server.js` | gRPC :50057                       |
| `gateway.js`          | REST + GraphQL + depth/cost :8088 |
| `generate-certs.sh`   | mTLS certs                        |
| `NOTES.md`            | คำตอบ                             |
