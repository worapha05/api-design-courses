# Level 1 — Beginner: API Paradigms & Schema Definitions

เป้าหมายระดับนี้: ให้คุณเข้าใจ **ทำไมโลก API จึงขยับจาก REST อย่างเดียว** และเริ่มออกแบบ GraphQL
Schema กับ Protocol Buffers ได้จริง ไม่ใช่แค่ “รัน server ได้” — เพื่อเลือก execution model และ
contract ให้เหมาะกับงาน

---

## สารบัญ

1. [Beyond REST — GraphQL และ gRPC คืออะไร](#1-beyond-rest--graphql-และ-grpc-คืออะไร)
2. [Architectural Shift และ Execution Models](#2-architectural-shift-และ-execution-models)
3. [เปรียบเทียบ Trade-offs: REST vs GraphQL vs gRPC](#3-เปรียบเทียบ-trade-offs-rest-vs-graphql-vs-grpc)
4. [GraphQL Foundations — SDL, Types, Query, Mutation](#4-graphql-foundations--sdl-types-query-mutation)
5. [gRPC Foundations — Protocol Buffers และ Unary RPC](#5-grpc-foundations--protocol-buffers-และ-unary-rpc)
6. [Best Practices สรุป](#6-best-practices-สรุป)

---

## 1. Beyond REST — GraphQL และ gRPC คืออะไร

REST ยังเป็นมาตรฐานที่แข็งแรง แต่มีข้อจำกัดเมื่อระบบเติบโต:

| ปัญหาที่พบบ่อยกับ REST                    | สิ่งที่ GraphQL / gRPC ช่วย                               |
| ----------------------------------------- | --------------------------------------------------------- |
| Over-fetching / under-fetching            | GraphQL ให้ client เลือก field                            |
| Endpoint ระเบิด (`/users/:id/orders/...`) | GraphQL รวมเป็น graph เดียว; gRPC รวมเป็น service methods |
| Contract หลวม (OpenAPI ไม่บังคับ runtime) | GraphQL schema + Protobuf เป็น typed contract             |
| JSON + HTTP/1.1 latency สูงใน mesh        | gRPC ใช้ binary + HTTP/2 multiplexing                     |

### GraphQL คืออะไร

**GraphQL** เป็น query language และ runtime สำหรับ API ที่ให้ client อธิบาย _รูปทรงของข้อมูล_
ที่ต้องการ Server มี **Schema** เป็นแหล่งความจริงเดียว (single source of truth) ของ type system

```
Client    GraphQL Server
 │     │
 │ { user(id) { name orders { id } } }
 │ ─────────────────────────────────▶│
 │     │ resolve ตาม field
 │ { "user": { "name": "...", ... } }
 │ ◀─────────────────────────────────│
```

### gRPC คืออะไร

**gRPC** เป็น RPC framework จาก Google ที่ใช้ **Protocol Buffers** เป็น IDL และ serialization
สื่อสารบน **HTTP/2** มี streaming, deadlines, metadata และ code generation หลายภาษา

```
Client (stub)   gRPC Server
 │     │
 │ GetUser(GetUserRequest)  │
 │ ──── binary protobuf ───────────▶│
 │     │ handler
 │ User    │
 │ ◀─── binary protobuf ────────────│
```

ดูเปรียบเทียบสั้น ๆ: [`examples/01-api-paradigms/`](./src/examples/01-api-paradigms/)

---

## 2. Architectural Shift และ Execution Models

### จาก Resource-Oriented → Graph / RPC

```
REST (resource): GET /users/1  → User JSON
   GET /users/1/orders → Orders JSON

GraphQL (graph): query { user(id:1) { name orders { total } } }

gRPC (procedure): UserService.GetUser({ id: 1 }) → User
   OrderService.ListByUser({ user_id: 1 }) → stream Order
```

### Execution Model

| โมเดล              | ลักษณะการทำงาน                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **REST**           | แต่ละ HTTP request แมปไปยัง resource/handler หนึ่งชุด; caching ตาม URL/method                       |
| **GraphQL**        | Parse → Validate กับ schema → Execute ทีละ field (resolver tree); สามารถ parallelize sibling fields |
| **gRPC Unary**     | เรียก procedure หนึ่งครั้ง ได้ response หนึ่งครั้ง (คล้าย function call ข้ามเครือข่าย)              |
| **gRPC Streaming** | ส่ง/รับหลาย message บน stream เดียว (เรียนในระดับ Intermediate)                                     |

### ทำไม “Schema-first” สำคัญ

ทั้ง GraphQL และ Protobuf ผลักให้ทีมตกลง **contract ก่อน implement**:

1. Frontend / consumer รู้ shape ของข้อมูลเร็วขึ้น
2. Backend รู้ boundary ของบริการ
3. สามารถ generate types / stubs / docs จาก schema
4. Breaking change ถูกตรวจเจอตั้งแต่ review `.graphql` / `.proto`

---

## 3. เปรียบเทียบ Trade-offs: REST vs GraphQL vs gRPC

| มิติ      | REST                     | GraphQL                              | gRPC                             |
| --------- | ------------------------ | ------------------------------------ | -------------------------------- |
| Payload   | JSON (ข้อความ)           | JSON (มักใช้)                        | Protobuf (binary)                |
| Transport | HTTP/1.1 หรือ HTTP/2     | HTTP (บ่อย) / WS สำหรับ subscription | HTTP/2 จำเป็น                    |
| Typing    | อ่อน–กลาง (OpenAPI)      | แข็งแรงที่ runtime                   | แข็งแรง + codegen                |
| Caching   | ง่ายที่ CDN/HTTP cache   | ยากกว่า (POST + variable query)      | ไม่เหมาะกับ public CDN           |
| Browser   | native                   | native                               | ต้อง gRPC-Web / proxy            |
| Debugging | ง่าย (curl, DevTools)    | ดี (GraphiQL)                        | ต้อง tooling (grpcurl, BloomRPC) |
| Best fit  | Public CRUD, simple APIs | BFF, complex UI data needs           | Internal microservices, high QPS |

### เมื่อไหร่ไม่ควรใช้ GraphQL

- API เรียบง่าย CRUD และทีมเล็ก — REST อาจพอ
- ต้องการ HTTP caching ระดับ CDN แบบ aggressive
- Client ไม่ต้องการความยืดหยุ่นของ query

### เมื่อไหร่ไม่ควรใช้ gRPC

- Public API ที่ต้องเรียกจาก browser โดยตรงโดยไม่มี proxy
- ทีมยังไม่พร้อมดูแล `.proto` versioning และ tooling
- ต้องการ human-readable payload เป็นหลัก (ops/debug)

> **กฎทอง:** ใช้ GraphQL เมื่อ **client diversity และ data shape** เป็นปัญหาหลัก ใช้ gRPC เมื่อ
> **latency, throughput และ typed contracts ระหว่างบริการ** เป็นปัญหาหลัก

---

## 4. GraphQL Foundations — SDL, Types, Query, Mutation

### Schema Definition Language (SDL)

SDL เป็นภาษาประกาศ type ของ GraphQL:

```graphql
type User {
  id: ID!
  name: String!
  email: String
  orders: [Order!]!
}

type Order {
  id: ID!
  total: Float!
  status: OrderStatus!
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
}

type Query {
  user(id: ID!): User
  users: [User!]!
}

type Mutation {
  createOrder(userId: ID!, total: Float!): Order!
}
```

สัญลักษณ์สำคัญ:

| สัญลักษณ์  | ความหมาย                                         |
| ---------- | ------------------------------------------------ |
| `Type!`    | non-null                                         |
| `[Type]`   | list (อาจมี null element)                        |
| `[Type!]!` | list ที่ไม่เป็น null และทุก element ไม่เป็น null |
| `ID`       | opaque identifier (มักเป็น string)               |

### Object Types, Scalars, Enums

- **Object Type** — entity ที่มี field (`User`, `Order`)
- **Scalar** — ค่า atomic: `Int`, `Float`, `String`, `Boolean`, `ID` (+ custom ในระดับ Intermediate)
- **Enum** — ชุดค่าคงที่ที่ schema บังคับ

### Query vs Mutation

|             | Query                            | Mutation                       |
| ----------- | -------------------------------- | ------------------------------ |
| เจตนา       | อ่านข้อมูล                       | เขียน/เปลี่ยน state            |
| Side effect | ไม่ควรมี (convention)            | มีได้และมักเป็นจุดประสงค์      |
| Parallelism | GraphQL สามารถรัน field พร้อมกัน | มักรันตามลำดับใน selection set |

ตัวอย่าง query:

```graphql
query GetUserWithOrders($id: ID!) {
  user(id: $id) {
    name
    orders {
      id
      total
      status
    }
  }
}
```

ตัวอย่าง mutation:

```graphql
mutation PlaceOrder($userId: ID!, $total: Float!) {
  createOrder(userId: $userId, total: $total) {
    id
    status
  }
}
```

ดู SDL เต็ม: [`examples/02-graphql-sdl/`](./src/examples/02-graphql-sdl/) ดู server ที่รันได้:
[`examples/03-graphql-server/`](./src/examples/03-graphql-server/)

### จุดที่มือใหม่มักพลาด

1. ใส่ business logic ใน schema แทน resolver — schema ควรเป็น _shape_ ไม่ใช่ _algorithm_
2. ทำให้ทุก field เป็น non-null (`!`) เกินไป — error ใน field หนึ่งอาจทำให้ parent พังทั้งก้อน
3. ออกแบบ GraphQL ให้ map 1:1 กับตาราง SQL — จะติด N+1 และ coupling สูง (แก้ใน Intermediate)

---

## 5. gRPC Foundations — Protocol Buffers และ Unary RPC

### Protocol Buffers (proto3)

Protobuf เป็น IDL + binary encoding ที่มีขนาดเล็กและ parse เร็วกว่า JSON โดยทั่วไป

```protobuf
syntax = "proto3";

package bookstore.v1;

option go_package = "bookstore/v1";

message Book {
 string id = 1;
 string title = 2;
 string author = 3;
 double price = 4;
}

message GetBookRequest {
 string id = 1;
}

message ListBooksRequest {
 int32 page_size = 1;
}

message ListBooksResponse {
 repeated Book books = 1;
}

service BookService {
 rpc GetBook(GetBookRequest) returns (Book);
 rpc ListBooks(ListBooksRequest) returns (ListBooksResponse);
}
```

กฎสำคัญของ proto3:

| หัวข้อ         | คำอธิบาย                                                                            |
| -------------- | ----------------------------------------------------------------------------------- |
| Field numbers  | ต้องไม่เปลี่ยนหลัง publish — เป็น identity ของ field ใน binary                      |
| `repeated`     | array / list                                                                        |
| Default values | ชนิด primitive มีค่า default (0, "", false) — ระวัง “ไม่ได้ตั้งค่า” vs “ตั้งเป็น 0” |
| Package        | ใช้สำหรับ namespacing และ version (`v1`, `v2`)                                      |

### Unary RPC

**Unary** = request หนึ่ง → response หนึ่ง (คล้าย HTTP request/response แต่เป็น typed RPC)

```
Client    Server
 │    │
 │ GetBook({ id: "b1" }) │
 │ ────────────────────────────▶│
 │    │ lookup
 │ Book { id, title, ... } │
 │ ◀────────────────────────────│
```

ข้อดีของ Unary สำหรับมือใหม่:

- เข้าใจง่าย ใกล้ REST
- Error model ชัด (`status codes`: NOT_FOUND, INVALID_ARGUMENT, …)
- เหมาะกับ CRUD ภายในบริการ

ดูตัวอย่าง server/client: [`examples/04-grpc-unary/`](./src/examples/04-grpc-unary/)

### gRPC Status Codes ที่ควรจำ

| Code                | เมื่อไหร่ใช้                         |
| ------------------- | ------------------------------------ |
| `OK`                | สำเร็จ                               |
| `INVALID_ARGUMENT`  | input ไม่ถูกต้อง                     |
| `NOT_FOUND`         | resource ไม่มี                       |
| `ALREADY_EXISTS`    | สร้างซ้ำ                             |
| `PERMISSION_DENIED` | authz ล้มเหลว                        |
| `UNAVAILABLE`       | บริการล่มชั่วคราว — client อาจ retry |
| `DEADLINE_EXCEEDED` | หมดเวลา                              |

---

## 6. Best Practices สรุป

1. **เลือกโปรโตคอลจากปัญหา ไม่จากกระแส** — ดูตาราง trade-offs ก่อนตัดสินใจ
2. **Schema / Proto เป็นเอกสารที่มีชีวิต** — review การเปลี่ยน field เหมือน review API public
3. **ตั้งชื่อให้สื่อเจตนา** — GraphQL ใช้ domain language; gRPC ใช้ `VerbNoun` (`GetBook`,
   `CreateOrder`)
4. **Version อย่างมีวินัย** — GraphQL: additive changes; Protobuf: อย่า reuse field number
5. **เริ่มจาก Unary + Query/Mutation ให้ชิน** ก่อนกระโดดไป streaming / federation

---

## เช็คลิสต์ก่อนขึ้น Intermediate

- [ ] อธิบายได้ว่า GraphQL แก้ over-fetching อย่างไร
- [ ] เขียน SDL มี Query + Mutation + Enum ได้
- [ ] เขียน `.proto` มี message + unary service ได้
- [ ] รัน GraphQL server และ gRPC unary client ได้
- [ ] เปรียบเทียบ trade-offs REST/GraphQL/gRPC ได้โดยไม่อิงแค่ “ใครดังกว่า”

พร้อมแล้วไปที่ [`LAB.md`](./LAB.md) และระดับ [`02-intermediate`](../02-intermediate/)
