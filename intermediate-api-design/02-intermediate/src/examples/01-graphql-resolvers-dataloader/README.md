# 01 — Resolvers, Input Types, Custom Scalars & DataLoader

```bash
node 02-intermediate/examples/01-graphql-resolvers-dataloader/server.js
```

ลองที่ http://localhost:4401:

```graphql
{
  users {
    name
    orders {
      id
      total
      createdAt
    }
  }
  dbCalls
}
```

ดูที่ terminal: ควรมี `[DB] findOrdersByUserIds(...)` **ประมาณ 1 ครั้ง** แม้มีหลาย users ถ้าเขียนแบบ
naive `orders.filter` ต่อ user โดยไม่ batch จะเป็น N+1
