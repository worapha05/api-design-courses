# Level 3 — Expert: Performance, Security Hardening & Data Stitching

ระดับผู้เชี่ยวชาญของ API Design Masterclass เป้าหมาย: แก้คอขวด REST/GraphQL, Hardening
ความปลอดภัยระดับ field และเข้าใจสถาปัตยกรรม Federation / API Mesh

---

## สารบัญ

1. [Performance Bottlenecks — REST](#1-performance-bottlenecks--rest)
2. [Performance Bottlenecks — GraphQL](#2-performance-bottlenecks--graphql)
3. [Enterprise API Security](#3-enterprise-api-security)
4. [Distributed Data: Federation & API Mesh](#4-distributed-data-federation--api-mesh)
5. [Cross-paradigm Decision Framework](#5-cross-paradigm-decision-framework)
6. [Best Practices ระดับ Production](#6-best-practices-ระดับ-production)
7. [ไฟล์ในระดับนี้](#7-ไฟล์ในระดับนี้)

---

## 1. Performance Bottlenecks — REST

### 1.1 Conditional Requests: ETag / If-None-Match

เป้าหมาย: ลด bandwidth และภาระ serialize เมื่อข้อมูลไม่เปลี่ยน

```
Client    Server
 |-- GET /books/b1 ------------------>|
 |<-- 200 ETag: "abc123" body ------|
 |     |
 |-- GET /books/b1   |
 | If-None-Match: "abc123" -------->|
 |<-- 304 Not Modified (no body) -----|
```

แนวทางสร้าง ETag:

- Hash ของ representation (เช่น SHA-256 ของ JSON) — แม่นแต่ CPU แพงขึ้น
- Version / `updatedAt` จาก DB — ถูกและเพียงพอในหลายระบบ

```http
HTTP/1.1 200 OK
ETag: W/"b1-1710000000"
Cache-Control: private, must-revalidate
```

`W/` = weak ETag (เทียบ equivalence ไม่ต้อง byte-identical)

### 1.2 Cache-Control

| Directive         | ความหมาย                      |
| ----------------- | ----------------------------- |
| `public`          | CDN/shared cache เก็บได้      |
| `private`         | เฉพาะ browser ของ user        |
| `max-age=60`      | fresh 60 วินาที               |
| `s-maxage=300`    | สำหรับ shared cache (CDN)     |
| `no-store`        | ห้ามเก็บ (ข้อมูลละเอียดอ่อน)  |
| `must-revalidate` | หมดอายุแล้วต้องเช็คกับ origin |

ตัวอย่าง catalog ที่เปลี่ยนช้า:

```http
Cache-Control: public, max-age=60, s-maxage=300
ETag: "catalog-v42"
Vary: Accept-Encoding
```

ตัวอย่างข้อมูลส่วนตัว:

```http
Cache-Control: private, no-store
```

### 1.3 Payload Compression

- เปิด `Content-Encoding: gzip` หรือ `br` (Brotli) ที่ reverse proxy (NGINX) หรือ middleware
- Client ส่ง `Accept-Encoding: gzip, deflate, br`
- JSON ขนาดใหญ่ได้ประโยชน์ชัด — อย่า compress ไฟล์ที่ compress แล้ว (JPEG, MP4)

### 1.4 สรุปชั้น Cache ของ REST

```
Browser Cache → CDN → API Gateway → App → DB
 ↑ ETag/Cache-Control เป็นสัญญาหลักระหว่างชั้นเหล่านี้
```

---

## 2. Performance Bottlenecks — GraphQL

### 2.1 N+1 Query Problem

Query:

```graphql
{
  books {
    title
    author {
      name
    } # resolver ต่อหนังสือ 1 เล่ม = 1 query
  }
}
```

ถ้ามี 100 หนังสือโดยไม่มี batching → 1 query ดึง books + 100 queries ดึง author = **N+1**

### 2.2 DataLoader — Batching + Caching ต่อ Request

DataLoader รวม keys ที่ถูกขอใน tick เดียวกันแล้วเรียก batch function ครั้งเดียว:

```ts
const authorLoader = new DataLoader(async (ids: readonly string[]) => {
  const rows = await db.authors.findByIds([...ids]); // WHERE id IN (...)
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id) ?? null);
});
```

ใน resolver:

```ts
Book: {
 author: (book, _, ctx) => ctx.loaders.author.load(book.authorId),
}
```

คุณสมบัติสำคัญ:

- **Batching:** รวม loads ใน event loop tick
- **Caching:** ภายใน request เดียวกัน key เดิมไม่ยิงซ้ำ
- **Per-request instance:** อย่าใช้ DataLoader แบบ global singleton ข้าม user —
  จะรั่วข้อมูลข้ามสิทธิ์

### 2.3 Query Depth Limiting

ป้องกัน:

```graphql
{ book { author { books { author { books { author { ... }}}}}}
```

```ts
import depthLimit from 'graphql-depth-limit';

new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(5)],
});
```

### 2.4 Query Complexity Analysis

แต่ละ field มี "cost" — ปฏิเสธ query ที่รวมแล้วเกินงบ:

```
books(limit: 100) cost 100
 reviews  cost × 10 ต่อ book
→ total 1000 — อาจเกิน maxComplexity
```

ใช้ได้ทั้ง static analysis (ก่อน execute) และ persisted queries (อนุญาตเฉพาะ query ที่ลงทะเบียน)

### 2.5 เครื่องมืออื่นที่ควรรู้

| เทคนิค                | บทบาท                                |
| --------------------- | ------------------------------------ |
| Persisted Queries     | ลด parse + กัน ad-hoc DoS            |
| Timeout / AbortSignal | กัน resolver ค้าง                    |
| APQ + CDN             | cache GET สำหรับ query ที่ hash แล้ว |
| `@defer` / `@stream`  | ส่งข้อมูลทีละส่วน (advanced clients) |

---

## 3. Enterprise API Security

### 3.1 Field-level Authorization

Authentication ตอบว่า "เป็นใคร" Authorization ตอบว่า "ดู field นี้ได้ไหม"

```ts
User: {
 email: (user, _, ctx) => {
 if (ctx.user.id !== user.id && !ctx.user.isAdmin) {
 throw new GraphQLError('Forbidden', {
 extensions: { code: 'FORBIDDEN' },
 });
 }
 return user.email;
 },
},
```

หรือใช้ directive:

```graphql
directive @auth(requires: Role!) on FIELD_DEFINITION

type User {
  id: ID!
  email: String! @auth(requires: OWNER)
  salary: Float @auth(requires: ADMIN)
}
```

### 3.2 Input Sanitization ที่ Directive / Validation Layer

- Validate ความยาว, pattern, enum ที่ schema boundary
- Reject HTML/script ใน text fields ถ้าไม่ต้องการ rich text
- อย่าส่ง raw input ลง SQL/NoSQL โดยไม่ parameterized query
- สำหรับ GraphQL: custom scalar (`EmailAddress`, `PositiveInt`) ช่วยบังคับรูปแบบ

### 3.3 Over-fetching / Under-fetching เป็นประเด็นความปลอดภัยด้วย

| ปัญหา                                   | ความเสี่ยง               |
| --------------------------------------- | ------------------------ |
| REST คืน PII เกินจำเป็นทุก endpoint     | data leakage             |
| GraphQL เปิด field อ่อนไหวโดยไม่มี auth | client ใดก็ query ได้    |
| Introspection เปิดใน production         | ช่วย attacker map schema |

แนวทาง:

- Principle of least data — คืนเท่าที่ use-case ต้องการ
- ปิด introspection ใน production (หรือจำกัดเฉพาะ internal)
- Review schema เหมือน review public API surface

### 3.4 Global Rate Limiting

ชั้นที่นิยม:

```
Client → CDN/WAF → API Gateway (rate limit) → Service
```

ตัวอย่าง policy:

- ตาม IP: 100 req/min
- ตาม API key: 1000 req/min
- ตาม user id: 60 GraphQL operations/min
- ตาม complexity score: budget ต่อนาที

Response เมื่อเกิน:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 100
RateLimit-Remaining: 0
```

ใน GraphQL ยังคง HTTP 429 ได้ที่ gateway — หรือคืน error `RATE_LIMITED` ใน `errors[]`

---

## 4. Distributed Data: Federation & API Mesh

### 4.1 ปัญหาที่ Federation แก้

Monolith GraphQL รวมทุก domain → ทีมใหญ่แย่ง schema, deploy ช้า แยก microservice แล้วให้ client
ยิงหลาย endpoint → กลับไปสู่ chatty / BFF กระจาย

**Apollo Federation** ให้แต่ละ service เป็น **subgraph** มี schema ของตัวเอง แล้ว **router/gateway**
รวมเป็น **supergraph** เดียว

```
  ┌────────── Supergraph Router ──────────┐
  │ /graphql (unified schema)  │
  └─────┬──────────┬──────────┬────────────┘
  │  │  │
  Users SG Orders SG Catalog SG
```

### 4.2 แนวคิดหลักของ Federation

```graphql
# Users subgraph
type User @key(fields: "id") {
  id: ID!
  name: String!
}

# Orders subgraph
type User @key(fields: "id") @extends {
  id: ID! @external
  orders: [Order!]!
}

type Order @key(fields: "id") {
  id: ID!
  totalCents: Int!
  buyer: User!
}
```

- `@key` ประกาศ entity ที่ stitch ข้าม subgraph ได้
- Service หนึ่งเป็น **owner** ของ field บางชุด อีก service **extend** entity

### 4.3 API Mesh (มุมกว้าง)

API Mesh / Integration layer ไม่จำกัดแค่ GraphQL:

- รวม REST, gRPC, events เข้าเป็น experience APIs
- นโยบายกลาง: auth, rate limit, observability, schema registry
- ตัวอย่างแนวคิดในอุตสาหกรรม: Apollo GraphOS, GraphQL Mesh, Kong + GraphQL, custom BFF mesh

เลือก Federation เมื่อ:

- มีหลายทีม domain-driven
- ต้องการ GraphQL unified สำหรับ clients
- พร้อมลงทุน schema registry + router ops

อย่าเลือก Federation เมื่อ:

- ทีมเล็ก schema เดียวพอ
- latency ของ entity resolution ข้าม network ยังไม่ถูกออกแบบ
- ยังไม่มีวินัย schema ownership

---

## 5. Cross-paradigm Decision Framework

```
คำถามเริ่มต้น: Client ต้องการความยืดหยุ่นของ query มากแค่ไหน?
 │
 ├─ น้อย + CDN cache สำคัญ → REST + ETag/Cache-Control
 │
 ├─ มาก + หลาย client surfaces → GraphQL (+ DataLoader + depth/complexity)
 │
 └─ หลายทีม microservice + unified graph → Federation / Mesh
```

| ความต้องการ     | เครื่องมือ                             |
| --------------- | -------------------------------------- |
| Conditional GET | ETag                                   |
| กัน N+1         | DataLoader / JOIN / batch API          |
| กัน query DoS   | depth + complexity + persisted queries |
| กัน data leak   | field auth + least data                |
| กัน abuse       | rate limit + WAF                       |
| รวมหลายบริการ   | Federation / Mesh / BFF                |

---

## 6. Best Practices ระดับ Production

1. สร้าง DataLoader **ต่อ request** ใน context
2. วัด resolver time และ DB query count ใน staging ด้วย query จริงจาก client
3. REST ที่ cache ได้ต้องส่ง `ETag` / `Cache-Control` / `Vary` ให้ครบ
4. อย่าเปิด GraphQL introspection สู่ internet โดยไม่มี auth
5. Rate limit ทั้ง REST และ GraphQL ที่ edge
6. Federation: กำหนดทีมเจ้าของ type/field ชัดเจน — ใช้ schema checks ใน CI
7. Security review ทุกครั้งที่เพิ่ม field ที่มี PII หรือ money

---

## 7. ไฟล์ในระดับนี้

```
03-expert/
├── README.md
├── LAB.md
├── federation/
│ ├── users-subgraph.graphql
│ ├── orders-subgraph.graphql
│ ├── catalog-subgraph.graphql
│ └── README.md
└── src/
 ├── package.json
 ├── tsconfig.json
 ├── data.ts
 ├── etag-cache-rest.ts ← ETag + Cache-Control + gzip
 ├── dataloader-demo.ts ← N+1 vs DataLoader
 ├── secure-graphql-server.ts ← depth limit, complexity, field auth, rate limit
 └── loaders.ts
```

รัน:

```bash
cd 03-expert/src
npm install
npx ts-node etag-cache-rest.ts       # :3300
npx ts-node dataloader-demo.ts       # prints N+1 vs batched counts
npx ts-node secure-graphql-server.ts # :4002
```
