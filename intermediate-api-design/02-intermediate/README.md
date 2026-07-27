# Level 2 — Intermediate: Advanced Resolvers & Streaming Protocols

เป้าหมายระดับนี้: ให้คุณสร้าง GraphQL ที่ **ไม่ตายเพราะ N+1** และใช้ **gRPC Streaming** กับ
**real-time / browser bridge** ได้อย่างมีหลักการ

---

## สารบัญ

1. [GraphQL Resolvers, Input Types และ Custom Scalars](#1-graphql-resolvers-input-types-และ-custom-scalars)
2. [ปัญหา N+1 และ DataLoader](#2-ปัญหา-n1-และ-dataloader)
3. [gRPC Streaming Patterns](#3-grpc-streaming-patterns)
4. [GraphQL Subscriptions (WebSockets)](#4-graphql-subscriptions-websockets)
5. [gRPC-Web สำหรับ Frontend](#5-grpc-web-สำหรับ-frontend)
6. [Best Practices สรุป](#6-best-practices-สรุป)

---

## 1. GraphQL Resolvers, Input Types และ Custom Scalars

### Resolver คืออะไร

แต่ละ field ใน schema มี function ที่ “เติมค่า” ให้ field นั้น — เรียกว่า **resolver**

```
Query.user → ดึง User
User.orders → ดึงออเดอร์ของ user คนนั้น
Order.items → ดึงรายการสินค้า
```

ลายเซ็นมาตรฐาน:

```js
(parent, args, context, info) => result;
```

| parameter | ความหมาย                                             |
| --------- | ---------------------------------------------------- |
| `parent`  | ผลลัพธ์ของ resolver ชั้นบน                           |
| `args`    | argument จาก query                                   |
| `context` | ของใช้ร่วม (DB, auth, DataLoader) — สร้างต่อ request |
| `info`    | metadata ของ AST / field path                        |

### Input Types

Mutation ที่รับ object ซับซ้อนควรใช้ `input` แทนการส่ง argument ยาว ๆ:

```graphql
input CreateProductInput {
  name: String!
  price: Float!
  tags: [String!]
}

type Mutation {
  createProduct(input: CreateProductInput!): Product!
}
```

ข้อดี: reuse ได้, validate ชัด, แยก input กับ output type (ห้ามใช้ output type เป็น input โดยตรง)

### Custom Scalars

ใช้เมื่อค่าไม่ใช่ scalar พื้นฐาน — เช่น `DateTime`, `Money`, `URL`:

```graphql
scalar DateTime

type Event {
  id: ID!
  startsAt: DateTime!
}
```

ต้อง implement `serialize` / `parseValue` / `parseLiteral` ระวัง: custom scalar ทำให้ client
หลายภาษาต้องตกลงรูปแบบ (ISO-8601 แนะนำสำหรับ DateTime)

ดูตัวอย่าง:
[`examples/01-graphql-resolvers-dataloader/`](./src/examples/01-graphql-resolvers-dataloader/)

---

## 2. ปัญหา N+1 และ DataLoader

### N+1 คืออะไร

```graphql
{
  users {
    name
    orders {
      id
    } # ถ้า users มี 100 คน → อาจยิง DB 1 + 100 ครั้ง
  }
}
```

```
1 query ดึง users
+ N queries ดึง orders ต่อ user
= N+1 queries
```

ในระบบจริง latency รวมพุ่ง และ DB ร้อนโดยไม่จำเป็น

### DataLoader แก้ได้อย่างไร

**DataLoader** รวม (batch) การโหลดที่เกิดใน tick เดียวกัน แล้ว cache ต่อ request:

```
users.orders สำหรับ u1, u2, u3
 ↓
DataLoader รวบเป็น IN (u1,u2,u3) ครั้งเดียว
 ↓
กระจายผลกลับแต่ละ resolver
```

หลักการสำคัญ:

1. สร้าง DataLoader **ใหม่ทุก request** ใน `context` — ห้ามใช้ global cache ข้าม user
2. Batch function ต้องคงลำดับผลให้ตรงกับ keys
3. DataLoader ไม่ใช่ magic — ยังต้องมี query ที่รองรับ `WHERE id IN (...)`

### Trade-offs

| ทางเลือก                        | ข้อดี                     | ข้อเสีย                         |
| ------------------------------- | ------------------------- | ------------------------------- |
| DataLoader                      | แก้ N+1 ใน graph ลึกได้ดี | ต้องวินัยเรื่อง per-request     |
| Join / nested SQL ตั้งแต่ชั้นบน | รอบเดียว                  | เสียความยืดหยุ่นของ field-level |
| Persisted queries + BFF shaping | ควบคุม shape              | ลดความไดนามิกของ GraphQL        |

> **กฎทอง:** ถ้า field ที่ nested ไป datastore เป็นประจำ — คิด DataLoader หรือ dataloader-like
> batching ตั้งแต่แรก

---

## 3. gRPC Streaming Patterns

Unary เหมาะกับ request/response สั้น ๆ แต่หลายงานต้องการ **ไหลของข้อมูลต่อเนื่อง**

### สามรูปแบบ

```
1) Server Streaming Client ──request──▶ Server ════ messages ══▶ Client
2) Client Streaming Client ════ messages ══▶ Server ──response──▶ Client
3) Bidirectional Client ════ messages ══▶◀════ messages ════ Server
```

| แบบ                  | Use case                                                           |
| -------------------- | ------------------------------------------------------------------ |
| **Server streaming** | download รายงานใหญ่, tail log, รายการสินค้าเป็นหน้า ๆ แบบ stream   |
| **Client streaming** | upload ไฟล์เป็นก้อน, ส่ง metrics ทีละจุดแล้วได้สรุปท้าย stream     |
| **Bidirectional**    | Chat, collaborative editing, live trading ที่ทั้งสองฝ่ายส่งได้ตลอด |

### Proto syntax

```protobuf
service Telemetry {
 rpc WatchMetrics(WatchRequest) returns (stream Metric);  // server
 rpc UploadSamples(stream Sample) returns (UploadSummary);  // client
 rpc Chat(stream ChatMessage) returns (stream ChatMessage); // bidi
}
```

### ประเด็นออกแบบที่สำคัญ

1. **Backpressure** — ถ้า client อ่านช้า server ต้องไม่บัฟเฟอร์ไม่จำกัด
2. **Cancellation** — เมื่อ client ยกเลิก ต้องหยุดงานฝั่ง server (ประหยัด CPU)
3. **Error กลาง stream** — ส่ง trailer / status; client ต้อง handle partial data
4. **Idempotency** — stream หลุดแล้ว resume อย่างไร (offset, cursor, sequence no.)

ดูตัวอย่าง: [`examples/02-grpc-streaming/`](./src/examples/02-grpc-streaming/)

---

## 4. GraphQL Subscriptions (WebSockets)

**Subscription** ให้ client “สมัคร” event แล้วรับ payload เมื่อเกิดการเปลี่ยนแปลง

```graphql
type Subscription {
  orderUpdated(orderId: ID!): Order!
}

type Mutation {
  updateOrderStatus(orderId: ID!, status: OrderStatus!): Order!
}
```

### Execution model

```
Client ──WS subscribe──▶ GraphQL Server
Mutation เกิด → PubSub.publish("ORDER", order)
  → ส่ง payload ไปยัง subscribers ที่ filter ตรง
```

เทคโนโลยีที่พบบ่อย:

- `graphql-ws` protocol บน WebSocket
- Redis PubSub เมื่อมีหลาย instance ของ server

### Trade-offs vs alternatives

| ทางเลือก                | เหมาะเมื่อ                                          |
| ----------------------- | --------------------------------------------------- |
| GraphQL Subscriptions   | Client เป็น GraphQL อยู่แล้ว และต้องการ typed event |
| SSE                     | Server → client อย่างเดียว, HTTP ธรรมดา             |
| gRPC server streaming   | Service-to-service หรือ mobile ที่มี gRPC           |
| Kafka / queue แล้ว push | fan-out ใหญ่, ต้องการ persistence                   |

ดูตัวอย่าง: [`examples/03-graphql-subscriptions/`](./src/examples/03-graphql-subscriptions/)

---

## 5. gRPC-Web สำหรับ Frontend

Browser **ไม่สามารถพูด native gRPC (HTTP/2 trailers เต็มรูปแบบ)** ได้ในลักษณะเดียวกับ backend จึงมี
**gRPC-Web**: โปรโตคอลที่ browser พูดได้ แล้วมี proxy (มักเป็น **Envoy**) แปลงเป็น gRPC จริง

```
Browser (gRPC-Web) ──HTTP/1.1 or HTTP/2──▶ Envoy ──gRPC──▶ Backend
```

### สิ่งที่ต้องรู้

1. ไม่รองรับ client streaming / bidi ครบทุกโหมดเหมือน native (ขึ้นกับ implementation)
2. ต้องเปิด CORS และตั้งค่า Envoy ให้ถูก
3. ยังได้ประโยชน์จาก Protobuf codegen และ typed stubs ฝั่ง TS/JS

ใน bootcamp นี้:

- Backend gRPC รันบน host `:50052`
- Envoy ใน Docker ฟัง `:8080` แล้ว proxy ไป backend

ดู [`examples/04-grpc-web/`](./src/examples/04-grpc-web/) และ `docker compose up`

---

## 6. Best Practices สรุป

1. **Context ต่อ request** ใส่ DataLoader, auth, tracing — ไม่ใช้ global mutable state
2. **Input types** สำหรับ mutation ที่ซับซ้อน; validate ที่ขอบเขต resolver
3. **เลือก streaming mode จากทิศทางข้อมูล** ไม่ใช่จาก “ดูเท่”
4. **Subscription ต้องมี authz ต่อ event** — อย่า broadcast ข้อมูลคนอื่น
5. **gRPC-Web เป็นสะพาน** — พิจารณาว่า BFF GraphQL อาจเหมาะกับ UI มากกว่าหรือไม่

---

## เช็คลิสต์ก่อนขึ้น Expert

- [ ] อธิบาย N+1 และโชว์ DataLoader batch ได้
- [ ] แยก Server / Client / Bidi streaming ได้พร้อม use case
- [ ] รัน GraphQL subscription แล้วเห็น event จาก mutation
- [ ] อธิบายบทบาท Envoy ใน gRPC-Web ได้

พร้อมแล้วไปที่ [`LAB.md`](./LAB.md) และระดับ [`03-expert`](../03-expert/)
