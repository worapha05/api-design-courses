# Lab — Level 3 Expert: Performance, Security & Federation

โจทย์สถานการณ์จริงระดับ production: แก้คอขวด, hardening ความปลอดภัย และออกแบบการ stitch
ข้อมูลข้ามบริการ

**เวลาแนะนำ:** 5–8 ชั่วโมง

---

## สารบัญ Lab

| Lab   | หัวข้อ                                                         | ความยาก  |
| ----- | -------------------------------------------------------------- | -------- |
| Lab 1 | REST ที่โหลดช้า + cache ผิด — ใส่ ETag / Cache-Control         | ⭐⭐⭐   |
| Lab 2 | GraphQL N+1 ทำให้ DB ล่ม — DataLoader + Depth/Complexity       | ⭐⭐⭐⭐ |
| Lab 3 | Data leak + DoS — Field Auth, Rate Limit, Federation ownership | ⭐⭐⭐⭐ |

---

# Lab 1 — ร้านค้าออนไลน์ที่ CDN ไม่ช่วย

## สถานการณ์

API `GET /catalog/books` คืน JSON ~200KB ทุกครั้ง CDN ถูกตั้งไว้แต่ **cache miss ตลอด** เพราะ:

1. Server ไม่ส่ง `Cache-Control` / `ETag`
2. Response มี `Date` และ `requestId` สุ่มใน body ทำให้ body ไม่เคยเหมือนเดิม (สมมติในระบบจริง)
3. หน้า PDP ยิง `GET /books/{id}` ซ้ำตอน user กดกลับมา — ไม่มี `If-None-Match`

ผู้ใช้มือถือในต่างจังหวัดบ่นว่าเปิดหมวดหนังสือช้า 2–3 วินาที

## สิ่งที่ต้องทำ

1. ออกแบบ headers ที่ถูกต้องสำหรับ:

- public catalog list
- book detail ของ user ที่ login แล้ว (private)
- endpoint ที่คืนข้อมูลบัตร (no-store)

2. Implement หรือปรับ `etag-cache-rest.ts` ให้รองรับ 304
3. อธิบายว่าทำไมใส่ `requestId` ใน body ถึงทำลาย cache
4. ทดสอบด้วย curl แล้วโชว์รอบแรก 200 รอบสอง 304

---

## เฉลย Lab 1 — วิธีคิด

### Header Matrix

| Endpoint                         | Cache-Control                          | ETag                     | เหตุผล             |
| -------------------------------- | -------------------------------------- | ------------------------ | ------------------ |
| `GET /catalog/books`             | `public, max-age=60, s-maxage=300`     | hash ของ body ที่ stable | CDN ช่วยได้        |
| `GET /books/{id}` (personalized) | `private, max-age=30, must-revalidate` | version/updatedAt        | เฉพาะ browser user |
| `GET /me/secret`                 | `private, no-store`                    | ไม่จำเป็น                | ห้ามเก็บ           |

### ทำไม requestId ใน body พัง cache

ETag/body cache อาศัย representation ที่เสถียร — ถ้าทุก response มี UUID สุ่มใน JSON จะไม่มีวัน
`If-None-Match` ตรง และ shared cache เก็บสำเนาไร้ประโยชน์ ย้าย correlation id ไปที่ **header** เช่น
`X-Request-Id` แทน

### โครงสร้างไฟล์

```
03-expert/src/etag-cache-rest.ts ← เฉลยพร้อมรัน
```

### ทดสอบ

```bash
cd 03-expert/src && npm install && npm run etag

# รอบ 1
curl -i http://localhost:3300/books/b1
# จด ETag จาก header

# รอบ 2 — ใส่ ETag ที่ได้จริงจาก updatedAt ของ b1
curl -i -H 'If-None-Match: W/"b1-2026-01-01T00:00:00Z"' http://localhost:3300/books/b1
# คาดหวัง: 304 Not Modified

curl -i http://localhost:3300/catalog/books | head
curl -i http://localhost:3300/me/secret | grep -i cache
```

### Compression

middleware `compression` จะใส่ `Content-Encoding: gzip` เมื่อ client ส่ง `Accept-Encoding: gzip` —
ใช้คู่กับ `Vary: Accept-Encoding`

---

# Lab 2 — Incident: GraphQL ทำให้ connection pool หมด

## สถานการณ์

Query จากแอป:

```graphql
query {
  books(limit: 50) {
    title
    author {
      name
    }
  }
}
```

Monitoring พบ:

- 50+ SQL `SELECT * FROM authors WHERE id = ?` ต่อ request
- p99 latency พุ่ง
- บางช่วง DB `too many connections`

ทีมสงสัยว่าเป็น N+1 จาก resolver `Book.author`

## สิ่งที่ต้องทำ

1. พิสูจน์ N+1 ด้วย `dataloader-demo.ts` (หรือเขียนเอง)
2. ใส่ DataLoader ใน context ต่อ request
3. เพิ่ม depth limit และ complexity limit
4. อธิบายว่าทำไม DataLoader ต้องสร้างใหม่ทุก request
5. ออกแบบค่า `maxDepth` / `maxComplexity` พร้อมเหตุผลคร่าวๆ

---

## เฉลย Lab 2 — วิธีคิด

### พิสูจน์

```bash
cd 03-expert/src && npm run dataloader
```

ผลลัพธ์แนวทาง:

```
N+1 → authorFindByIdCalls: 30
DataLoader → authorFindByIdsCalls: 1
```

### แก้ใน resolver

```typescript
// ผิด — N+1
author: (book) => findAuthorById(book.authorId);

// ถูก
author: (book, _, ctx) => ctx.loaders.authorLoader.load(book.authorId);
```

Batch function:

```typescript
new DataLoader(async (ids) => {
  const rows = await findAuthorsByIds(ids); // WHERE id IN (...)
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id) ?? null); // รักษาลำดับให้ตรง ids
});
```

### ทำไม per-request

DataLoader มี cache ภายใน — ถ้าใช้ singleton ข้าม request:

- User A โหลด `User.email` แล้ว User B อาจได้ค่าจาก cache (IDOR / leak)
- ข้อมูลเก่าข้าม request โดยไม่ invalidate

### Depth & Complexity

| กลไก        | กันอะไร                         | ค่าเริ่มต้นที่แนะนำใน lab            |
| ----------- | ------------------------------- | ------------------------------------ |
| Depth limit | recursive nesting DoS           | 5–7                                  |
| Complexity  | books(limit:9999){ reviews... } | คำนวณตาม cost model; ใน demo ใช้ ~80 |

ดู implementation ใน `secure-graphql-server.ts`

ทดสอบ depth (ควรถูก reject):

```graphql
{
  node {
    author {
      name
    }
  }
}
```

(ปรับ query ให้ลึกเกิน 5 ตาม schema ที่คุณเพิ่ม nested fields — หรือลด limit ชั่วคราวเป็น 2
เพื่อทดลอง)

ทดสอบ complexity: `books(limit: 50) { title author { name } }` อาจใกล้เพดานถ้า estimator นับ limit

---

# Lab 3 — Security Review + ออกแบบ Federation Ownership

## ส่วน A — Data Leak

Schema เปิด field:

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  salaryCents: Int
}
```

ใครก็ query `salaryCents` ของทุกคนได้ และ introspection เปิดใน production

### สิ่งที่ต้องทำ (A)

1. ใส่ field-level auth: `email` เฉพาะเจ้าของหรือ admin, `salaryCents` เฉพาะ admin
2. ปิด introspection ใน production
3. ใส่ rate limit ต่อ API key / IP
4. อธิบาย over-fetching ที่เป็นช่องโหว่ (ไม่ใช่แค่ performance)

## ส่วน B — แยกทีม Microservice

องค์กรมี 3 ทีม: Users, Catalog, Orders Client อยากได้:

```graphql
{
  me {
    name
    email
    authoredBooks {
      title
    }
    orders {
      totalCents
      status
    }
  }
}
```

### สิ่งที่ต้องทำ (B)

1. แบ่ง subgraph ownership ใครเป็นเจ้าของ type/field ไหน
2. เขียน `@key` / `extend type` ตามแนว federation ใน folder `federation/`
3. อธิบายลำดับที่ Router resolve entity
4. ชี้ความเสี่ยง latency เมื่อ fan-out ข้าม subgraph เยอะ

---

## เฉลย Lab 3 — วิธีคิด

### ส่วน A — Field Auth

```typescript
User: {
 email(user, _, ctx) {
 if (!ctx.user) throw new GraphQLError('UNAUTHENTICATED');
 if (ctx.user.id !== user.id && ctx.user.role !== 'ADMIN') {
 throw new GraphQLError('FORBIDDEN');
 }
 return user.email;
 },
 salaryCents(user, _, ctx) {
 if (ctx.user?.role !== 'ADMIN') throw new GraphQLError('FORBIDDEN');
 return user.salaryCents;
 },
}
```

Introspection:

```typescript
introspection: process.env.NODE_ENV !== 'production',
```

Rate limit: token bucket ใน context (ดู `secure-graphql-server.ts`) — production ใช้ Redis + Gateway

**Over-fetching = security:** REST ที่คืนทั้ง user row รวม PII ให้หน้า public profile = leak GraphQL
ที่เปิด field โดยไม่มี auth = attacker เลือก field เองได้ทันทีผ่าน introspection

ทดสอบ:

```bash
cd 03-expert/src && npm run secure

# user ดู email ของคนอื่น → FORBIDDEN
curl -s http://localhost:4002/ -H 'content-type: application/json' \
  -H 'Authorization: Bearer user:u1' \
  -d '{"query":"{ user(id:\"u2\"){ name email } }"}'

# admin ดู salary ได้
curl -s http://localhost:4002/ -H 'content-type: application/json' \
  -H 'Authorization: Bearer admin:u2' \
  -d '{"query":"{ user(id:\"u1\"){ name salaryCents } }"}'
```

### ส่วน B — Federation Ownership

| Type / Field                   | Owner Subgraph |
| ------------------------------ | -------------- |
| `User.id, name, email`         | users          |
| `Book.*`, `User.authoredBooks` | catalog        |
| `Order.*`, `User.orders`       | orders         |

ไฟล์เฉลย:

```
03-expert/federation/
├── users-subgraph.graphql
├── catalog-subgraph.graphql
├── orders-subgraph.graphql
└── README.md
```

### ลำดับ Resolve โดยย่อ

```
1. Router รับ query me { name authoredBooks { title } orders { status } }
2. วางแผน: users.me → ได้ User { id }
3. Fan-out:
 catalog: User(id) { authoredBooks }
 orders: User(id) { orders }
4. รวมผลเป็น response เดียวส่ง client
```

### ความเสี่ยง

- ถ้า `me` ดึง 15 entities ข้าม 8 subgraphs → latency รวมแบบ waterfall/fan-out
- ต้องมี timeout, hedging, และไม่ให้ client query ลึกเกินโดยไม่มี complexity budget ที่ router

### API Mesh มุมกว้าง

Federation คือ mesh สำหรับ GraphQL schemas ถ้ามี REST/gRPC ด้วย อาจใช้ GraphQL Mesh / BFF gateway
เป็นชั้นประสบการณ์เดียว — นโยบาย auth และ rate limit ควรอยู่ที่ edge กลาง

---

## เกณฑ์ผ่าน Level 3

- [ ] อธิบายและสาธิต ETag 200 → 304 ได้
- [ ] วัดและแก้ N+1 ด้วย DataLoader (per-request)
- [ ] มี depth limit + complexity guard
- [ ] Field-level auth กัน email/salary ได้
- [ ] วาด ownership ของ Federation subgraph และอธิบาย `@key` ได้

---

## จบหลักสูตร

คุณครบเส้นทาง **Zero → Expert** ของ API Design Masterclass แล้ว

ทบทวน checklist รวมที่ [`../README.md`](../README.md) แนะนำ project ต่อยอด:

1. เขียน OpenAPI + GraphQL สำหรับ domain ของคุณเองแบบ dual-stack
2. ใส่ CI: spectral (OpenAPI lint) + GraphQL schema breaking-change check
3. ทดลอง Apollo Router + 2 subgraphs บน Docker Compose
