# NovaShelf Lab — Solution

รันตามลำดับ (แนะนำ — shared memory ใน process เดียว):

```bash
# จาก root ของ bootcamp (ต้อง npm install แล้ว)
node combined-server.js

# terminal 2 — สาธิต end-to-end
node demo.js
```

ไฟล์:

| ไฟล์                                   | หน้าที่                                         |
| -------------------------------------- | ----------------------------------------------- |
| `store.js`                             | shared in-memory store                          |
| `schema.graphql`                       | SDL อ้างอิง                                     |
| `inventory.proto`                      | gRPC contract                                   |
| `combined-server.js`                   | GraphQL + gRPC ใน process เดียว (ผ่านเกณฑ์ lab) |
| `graphql-server.js` / `grpc-server.js` | แยก process — ศึกษาโครงสร้าง                    |
| `demo.js`                              | สาธิต GraphQL ↔ gRPC                            |
| `NOTES.md`                             | คำตอบคำถามคิด                                   |
