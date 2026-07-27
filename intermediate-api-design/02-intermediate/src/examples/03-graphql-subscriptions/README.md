# 03 — GraphQL Subscriptions

```bash
node 02-intermediate/examples/03-graphql-subscriptions/server.js
```

ใช้ client ที่รองรับ `graphql-ws` (เช่น Apollo Sandbox / graphql-ws client)

1. Subscribe:

```graphql
subscription {
  orderUpdated(orderId: "ord-1") {
    id
    status
  }
}
```

2. ในแท็บอื่น ยิง mutation:

```graphql
mutation {
  updateOrderStatus(orderId: "ord-1", status: PAID) {
    id
    status
  }
}
```

หมายเหตุ: filter ตาม `orderId` ทำใน `resolve` — production ควร filter ที่ PubSub topic เพื่อไม่ส่ง
event เกินจำเป็น
