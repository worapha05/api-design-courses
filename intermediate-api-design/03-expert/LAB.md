# Lab ระดับ Expert — platform “AetherEdge”

## เป้าหมาย

ออกแบบและสร้าง **edge platform** จำลองที่รวมหัวข้อ Expert ทั้งหมด:

1. **Federation-style composition** — รวม Products + Inventory เป็น graph เดียว
2. **Query depth + cost limits** — กัน DoS บน public GraphQL
3. **gRPC internal services** — inventory เป็น Unary + ใช้ channel reuse
4. **API Gateway** — REST และ GraphQL ภายนอก เรียก gRPC ภายใน
5. **Trace propagation + mTLS** — ส่ง `x-trace-id` และ (optional) เปิด mutual TLS

ทำด้วยตัวเองก่อน แล้วค่อยเทียบกับ [`lab/solution/`](./src/lab/solution/)

---

## กรณีศึกษา

บริษัท **AetherEdge** มีบริการภายในพูด gRPC ล้วน แต่พาร์ทเนอร์ภายนอกต้องการ REST/GraphQL ทีม
security กังวลว่า GraphQL จะถูกยิง query แพง และ traffic ภายในยังเป็น plaintext

คุณได้รับมอบหมายให้สร้าง prototype ใน 1 วัน:

```
Partner ──REST/GraphQL──▶ Gateway :8088
    │ (trace id, authz stub)
    ▼
   Inventory gRPC :50057 (mTLS optional)
    │
Public GraphQL also stitches Product catalog (in-process or HTTP)
```

---

## โจทย์

### ส่วนที่ 1 — Internal gRPC Inventory

`inventory.proto`:

```protobuf
service Inventory {
 rpc GetItem(GetItemRequest) returns (Item);
 rpc Reserve(ReserveRequest) returns (Item);
}
```

ข้อกำหนด:

1. Seed สินค้าอย่างน้อย 3 รายการ (`sku`, `name`, `quantity`)
2. `Reserve` ลด quantity — ถ้าไม่พอคืน `FAILED_PRECONDITION`
3. Log ทุก call พร้อม `x-trace-id` จาก metadata
4. รองรับ mTLS เมื่อมีไฟล์ใน `certs/`

### ส่วนที่ 2 — Gateway

port **8088**:

| Endpoint                                       | พฤติกรรม                                    |
| ---------------------------------------------- | ------------------------------------------- |
| `GET /items/:sku`                              | → `GetItem`                                 |
| `POST /items/:sku/reserve` body `{ "qty": 1 }` | → `Reserve`                                 |
| `POST /graphql`                                | GraphQL ที่ map ไป gRPC + มี Product fields |
| ทุก response                                   | มี header `x-trace-id`                      |

GraphQL schema อย่างน้อย:

```graphql
type Item {
  sku: ID!
  name: String!
  quantity: Int!
}

type Query {
  item(sku: ID!): Item
}

type Mutation {
  reserve(sku: ID!, qty: Int!): Item!
}
```

### ส่วนที่ 3 — Security บน GraphQL

1. Depth limit ≤ 5
2. Cost budget (สูตรของคุณเอง) — query ที่แพงต้องถูก reject
3. เขียนตัวอย่าง query ที่ถูกบล็อกไว้ใน `NOTES.md`

### ส่วนที่ 4 — Performance note

ใน `NOTES.md` อธิบายสั้น ๆ ว่า gateway ต้อง **reuse gRPC stub** อย่างไร และถ้าสร้างใหม่ทุก request
จะเกิดอะไร

### ส่วนที่ 5 — (Optional) mTLS

รัน `generate-certs.sh` แล้วให้ server ปฏิเสธ client ที่ไม่มี cert

---

## เกณฑ์ผ่าน

- [ ] REST และ GraphQL เรียก inventory สำเร็จ
- [ ] Trace id ต่อเนื่องจาก gateway → gRPC log
- [ ] Depth/cost จำกัดทำงาน
- [ ] NOTES.md ครบ
- [ ] (Bonus) mTLS เปิดได้

---

## เฉลย

ดู [`lab/solution/`](./src/lab/solution/)
