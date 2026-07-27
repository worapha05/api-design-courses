# Level 3 — Expert: Enterprise Security, Performance & Gateway Orchestration

เป้าหมายระดับนี้: ให้คุณออกแบบ GraphQL/gRPC ในระดับ **production multi-service** — federation,
ป้องกัน DoS จาก query, ปรับ HTTP/2 และสร้าง **edge gateway** พร้อม tracing กับ mTLS

---

## สารบัญ

1. [Federation & Subgraphs](#1-federation--subgraphs)
2. [Performance Tuning & GraphQL Security](#2-performance-tuning--graphql-security)
3. [gRPC บน HTTP/2 — Payload, Connection Reuse, Multiplexing](#3-grpc-บน-http2--payload-connection-reuse-multiplexing)
4. [Production Gateway — REST/GraphQL → gRPC](#4-production-gateway--restgraphql--grpc)
5. [OpenTelemetry และ Mutual TLS (mTLS)](#5-opentelemetry-และ-mutual-tls-mtls)
6. [Best Practices สรุป](#6-best-practices-สรุป)

---

## 1. Federation & Subgraphs

เมื่อ GraphQL schema โตเกินขอบเขตทีมเดียว การรวมทุกอย่างใน monolith schema จะกลายเป็นคอขวดของ
ownership

### แนวคิด Apollo Federation

```
  ┌─────────────┐
Client → │ Gateway │ (supergraph)
  └──────┬──────┘
 ┌───────────┼───────────┐
 ▼  ▼  ▼
 Products Reviews Users
 (subgraph) (subgraph) (subgraph)
```

- **Subgraph** — บริการที่เป็นเจ้าของ entity / field บางส่วน
- **Gateway / Router** — รวม schema เป็น **supergraph** แล้ววางแผน query ข้ามบริการ
- **Entity** — type ที่อ้างอิงข้าม subgraph ด้วย `@key`

ตัวอย่างแนวคิด:

```graphql
# products subgraph
type Product @key(fields: "id") {
  id: ID!
  name: String!
  price: Float!
}

# reviews subgraph
extend type Product @key(fields: "id") {
  id: ID! @external
  reviews: [Review!]!
}
```

### Trade-offs

| ข้อดี                               | ข้อเสีย                                  |
| ----------------------------------- | ---------------------------------------- |
| ทีมเป็นเจ้าของ schema ตาม domain    | ความซับซ้อนของ composition / entity keys |
| Deploy subgraph อิสระ               | Latency รวมจาก fan-out ข้ามบริการ        |
| Supergraph เป็นสัญญาเดียวต่อ client | ต้องมี platform team ดูแล gateway        |

> **กฎทอง:** Federation ไม่ใช่เป้าหมาย — เป็นเครื่องมือเมื่อ **ownership ของ schema**
> ต้องแยกตามทีมจริง ๆ

ในตัวอย่าง bootcamp เราจำลอง composition แบบเบา (schema stitching / manual gateway)
เพื่อให้เห็นแนวคิดโดยไม่ต้องพึ่ง Apollo Rover เต็มชุด ดู
[`examples/01-federation-subgraphs/`](./src/examples/01-federation-subgraphs/)

---

## 2. Performance Tuning & GraphQL Security

GraphQL ให้พลังกับ client — พลังเดียวกันกลายเป็น **อาวุธ DoS** ได้

### Query Depth Limiting

```graphql
{
 a { b { c { d { e { f { ... } } } } } } # ลึกเกินจำเป็น
}
```

จำกัดความลึกสูงสุด (เช่น 7–10) ด้วย validation rule เช่น `graphql-depth-limit`

### Query Cost Analysis

Depth อย่างเดียวไม่พอ — query ตื้นแต่กว้างมากก็แพง:

```graphql
{
  users(first: 1000) {
    posts(first: 1000) {
      comments(first: 1000) {
        id
      }
    }
  }
}
```

แนวทาง:

1. กำหนด **cost ต่อ field** (list field แพงกว่า scalar)
2. คูณด้วย arguments (`first`, `limit`)
3. Reject ถ้าเกิน budget ต่อ request / ต่อผู้ใช้

### มาตรการอื่น

| มาตรการ                 | จุดประสงค์                   |
| ----------------------- | ---------------------------- |
| Timeout / deadline      | กัน resolver ค้าง            |
| Persisted queries       | อนุญาตเฉพาะ query ที่อนุมัติ |
| Rate limiting           | จำกัด QPS ต่อ API key / IP   |
| Complexity + depth      | กัน combinatorial explosion  |
| AUT / authz ระดับ field | กันอ่าน field อ่อนไหว        |

ดู [`examples/02-query-cost-security/`](./src/examples/02-query-cost-security/)

---

## 3. gRPC บน HTTP/2 — Payload, Connection Reuse, Multiplexing

### ทำไม HTTP/2 สำคัญ

- **Multiplexing** — หลาย RPC พร้อมกันบน connection เดียว โดยไม่โดน head-of-line blocking แบบ
  HTTP/1.1
- **Header compression (HPACK)** — ลด overhead metadata
- **Binary framing** — เหมาะกับ Protobuf

### Connection reuse

```
❌ ผิด: สร้าง Channel / Client ใหม่ทุก request
✅ ถูก: สร้าง Channel ครั้งเดียวต่อ process (หรือ pool เล็ก ๆ) แล้ว reuse stub
```

การเปิด TCP + HTTP/2 handshake ใหม่ทุกครั้งทำลายประโยชน์ของ gRPC

### ปรับ payload

1. หลีกเลี่ยง field ที่ไม่ใช้ — ออกแบบ message ให้เหมาะกับ RPC (อย่าคืนทั้ง aggregate ใหญ่เสมอ)
2. ใช้ `repeated` อย่างมีสติ; พิจารณา pagination / streaming
3. เปิด compression (gzip) เมื่อ CPU ถูกกว่า bandwidth — วัดก่อนเปิดทั่วระบบ
4. ตั้ง **deadline** ทุก call — กัน cascade failure

ดู [`examples/03-grpc-performance-http2/`](./src/examples/03-grpc-performance-http2/)

---

## 4. Production Gateway — REST/GraphQL → gRPC

หลายองค์กรเก็บ **gRPC เป็น internal** และเปิด **REST หรือ GraphQL ที่ edge**

```
Internet → API Gateway (auth, rate limit, transform)
  │
  ├─ REST /orders/:id ──map──▶ OrderService.GetOrder (gRPC)
  └─ GraphQL query ──map──▶ หลาย gRPC stubs
```

รูปแบบที่พบบ่อย:

| รูปแบบ                 | หมายเหตุ                                |
| ---------------------- | --------------------------------------- |
| **grpc-gateway** (Go)  | generate REST จาก proto annotations     |
| **Envoy + transcoder** | L7 proxy แปลง JSON ↔ protobuf           |
| **Custom BFF**         | Node/Go เขียน mapping เอง — ยืดหยุ่นสูง |

### สิ่งที่ gateway ต้องทำ

1. Authentication / Authorization ที่ขอบเขตภายนอก
2. Protocol translation + error mapping (`5xx` ↔ gRPC status)
3. Idempotency keys, request id, correlation
4. ไม่ให้ logic ธุรกิจหนาเกินไป — ธุรกิจอยู่ใน microservice

ดู [`examples/04-gateway-otel-mtls/`](./src/examples/04-gateway-otel-mtls/)

---

## 5. OpenTelemetry และ Mutual TLS (mTLS)

### Distributed Tracing

เมื่อ request ผ่าน Gateway → Service A → Service B ต้องมี **trace context** ต่อเนื่อง

```
traceparent: 00-<trace-id>-<span-id>-01
```

OpenTelemetry (OTel) เป็นมาตรฐาน instrument:

- สร้าง span ต่อ RPC / HTTP
- Propagate context ใน gRPC metadata / HTTP headers
- Export ไป Jaeger / Tempo / Honeycomb

ในตัวอย่างเราจำลองการส่ง `x-trace-id` ผ่าน metadata เพื่อให้เห็นแนวคิดโดยไม่บังคับ collector

### Mutual TLS (mTLS)

TLS ปกติ: client ตรวจ server certificate **mTLS**: server ตรวจ client certificate ด้วย →
ยืนยันตัวตนบริการใน mesh

```
Service A (client cert) ════ TLS ════ Service B (server cert + require client cert)
```

เหมาะกับ service-to-service ภายใน — คู่กับ SPIFFE/SPIRE หรือ cert จาก service mesh (Istio, Linkerd)

ข้อควรคิด:

- หมุนเวียน certificate (rotation)
- อย่า hardcode cert ใน image โดยไม่มี secret management
- แยก trust domain ระหว่าง env (dev/stage/prod)

---

## 6. Best Practices สรุป

1. **Federation เมื่อทีม/domain แยกจริง** — ไม่ใช่เพื่อเพิ่มจำนวน repo
2. **Depth + Cost + Timeout** เป็นชุดขั้นต่ำของ GraphQL public API
3. **Reuse gRPC channel** และตั้ง deadline ทุก call
4. **Edge แปลงโปรโตคอล — Core พูด gRPC** พร้อม mTLS
5. **Trace ทุก hop** — ไม่มี tracing = debug ข้ามบริการมืด

---

## เช็คลิสต์จบหลักสูตร

- [ ] อธิบาย entity `@key` และการ resolve ข้าม subgraph ได้
- [ ] ตั้ง depth/cost limit และอธิบายทำไม depth อย่างเดียวไม่พอ
- [ ] วัด/สาธิต connection reuse บน HTTP/2
- [ ] สร้าง gateway ที่แปลง REST → gRPC พร้อม trace id และ mTLS (หรือจำลอง cert)

ไปที่ [`LAB.md`](./LAB.md) เพื่อ project รวมยอด
