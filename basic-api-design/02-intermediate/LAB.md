# Lab — Level 2 Intermediate: Contracts, Advanced Schema & Lifecycle

โจทย์ทดสอบการออกแบบ OpenAPI contract, GraphQL Type System ขั้นสูง และการจัดการ Versioning /
Deprecation

**เวลาแนะนำ:** 4–6 ชั่วโมง

---

## สารบัญ Lab

| Lab   | หัวข้อ                                                             | ความยาก |
| ----- | ------------------------------------------------------------------ | ------- |
| Lab 1 | แปลง API ที่ไม่มีสัญญา → OpenAPI v3 Contract-First                 | ⭐⭐⭐  |
| Lab 2 | Refactor GraphQL Schema ให้ใช้ Input / Interface / Union / Payload | ⭐⭐⭐  |
| Lab 3 | วางแผน Breaking Change + Versioning / Deprecation                  | ⭐⭐⭐  |

---

# Lab 1 — จาก "API ไม่มีสัญญา" สู่ OpenAPI v3

## สถานการณ์

ทีม Payment เปิด endpoint โดยไม่มีเอกสาร มีแค่ข้อความใน Slack:

```
POST /charge
body: { amt, card, user }
คืน { ok: true, tx: "..." } หรือ { ok: false, msg: "..." }
ทุกอย่าง status 200
ไม่มี auth ชัดเจน — ส่ง header token ก็ได้ไม่ส่งก็ได้
```

Partner เริ่ม integrate แล้วพังบ่อยเพราะ field เปลี่ยนชื่อ (`amt` → `amount`) โดยไม่บอกล่วงหน้า

## สิ่งที่ต้องทำ

1. ออกแบบ OpenAPI v3 สำหรับ Payment Charges API (resource-oriented กว่าเดิม)
2. แยก `CreateChargeRequest` กับ `Charge` response
3. กำหนด `securitySchemes` (bearer หรือ API key)
4. ใส่ error responses ด้วย Problem Details
5. (โบนัส) ระบุ idempotency ด้วย header `Idempotency-Key`

### คำถามชี้นำ

- ควรเป็น `POST /charges` หรือคง `/charge`?
- `amt` เป็น float อันตรายอย่างไร — ควรเป็นอะไรแทน?
- ทำไมต้องแยก schema request/response?

---

## เฉลย Lab 1 — วิธีคิด

### Resource modeling

- Collection: `/charges`
- Item: `/charges/{chargeId}`
- สร้างด้วย `POST /charges` → `201` + `Charge`
- อ่านด้วย `GET /charges/{chargeId}` → `200` / `404`

เงินใช้ **integer minor units** (`amountCents`) + `currency` (ISO 4217) เพื่อเลี่ยง float

### โครงสร้างไฟล์

```
02-intermediate/specs/lab1-charges.openapi.yaml
```

### โค้ดเฉลย (OpenAPI ย่อ)

```yaml
openapi: 3.0.3
info:
 title: Charges API
 version: 1.0.0
servers:
 - url: https://payments.example.com/v1
security:
 - bearerAuth: []
paths:
 /charges:
 post:
 summary: Create a charge
 parameters:
 - name: Idempotency-Key
  in: header
  required: true
  schema:
  type: string
  format: uuid
 requestBody:
 required: true
 content:
  application/json:
  schema:
  $ref: '#/components/schemas/CreateChargeRequest'
 responses:
 '201':
  description: Charge created
  content:
  application/json:
  schema:
  $ref: '#/components/schemas/Charge'
 '400':
  $ref: '#/components/responses/BadRequest'
 '401':
  $ref: '#/components/responses/Unauthorized'
 '409':
  description: Duplicate Idempotency-Key with different body
 /charges/{chargeId}:
 get:
 parameters:
 - name: chargeId
  in: path
  required: true
  schema:
  type: string
 responses:
 '200':
  content:
  application/json:
  schema:
  $ref: '#/components/schemas/Charge'
 '404':
  $ref: '#/components/responses/NotFound'
components:
 securitySchemes:
 bearerAuth:
 type: http
 scheme: bearer
 schemas:
 CreateChargeRequest:
 type: object
 required: [amountCents, currency, customerId, paymentMethodId]
 properties:
 amountCents:
  type: integer
  minimum: 1
 currency:
  type: string
  enum: [THB, USD]
 customerId:
  type: string
 paymentMethodId:
  type: string
 Charge:
 type: object
 required: [id, amountCents, currency, status, customerId, createdAt]
 properties:
 id:
  type: string
 amountCents:
  type: integer
 currency:
  type: string
 status:
  type: string
  enum: [PENDING, SUCCEEDED, FAILED]
 customerId:
  type: string
 createdAt:
  type: string
  format: date-time
 Problem:
 type: object
 properties:
 type: { type: string }
 title: { type: string }
 status: { type: integer }
 detail: { type: string }
 responses:
 BadRequest:
 description: Validation error
 content:
 application/problem+json:
  schema:
  $ref: '#/components/schemas/Problem'
 Unauthorized:
 description: Unauthorized
 content:
 application/problem+json:
  schema:
  $ref: '#/components/schemas/Problem'
 NotFound:
 description: Not found
 content:
 application/problem+json:
  schema:
  $ref: '#/components/schemas/Problem'
```

**สรุปคำตอบ:** `POST /charges` + integer money + auth บังคับ + แยก request/response = partner
integrate ได้จาก spec โดยไม่เดา Slack

---

# Lab 2 — Refactor Schema GraphQL ที่แย่

## Schema เดิมที่แย่

```graphql
type Query {
  getStuff(type: String, id: String): String
}

type Mutation {
  createBook(title: String, isbn: String, authorId: String, price: Float, genre: String): String
}
```

ปัญหา: คืน `String` (JSON string?), ไม่มี type safety, ไม่มี enum, ไม่มี error model, ไม่มี
interface สำหรับ catalog

## สิ่งที่ต้องทำ

1. ออกแบบ SDL ใหม่ให้รองรับ `Book` และ `Magazine` ภายใต้ `CatalogItem`
2. ใช้ `CreateBookInput` + `CreateBookPayload` + `UserError`
3. เพิ่ม `search` ที่คืน `Union`
4. Implement `__resolveType` ใน resolvers
5. ทดสอบ mutation ที่ ISBN ผิด แล้วต้องได้ `userErrors` ไม่ใช่ crash อย่างเดียว

---

## เฉลย Lab 2 — วิธีคิด

### เป้าหมายของ refactor

| เดิม                    | ใหม่                                           |
| ----------------------- | ---------------------------------------------- |
| `String` blob           | Typed objects                                  |
| genre เป็น String อิสระ | `enum Genre`                                   |
| args ยาวบน mutation     | `input CreateBookInput`                        |
| error ไม่ชัด            | `userErrors` ใน payload                        |
| ไม่มี polymorphism      | `interface CatalogItem` + `union SearchResult` |

### ใช้ของที่มีในคอร์ส

ดู `specs/advanced-schema.graphql` และ `src/advanced-resolvers.ts` เป็นเฉลยสมบูรณ์

รัน:

```bash
cd 02-intermediate/src
npm install
npm run graphql
```

ทดสอบ validation path:

```bash
curl -s http://localhost:4001/ -H 'content-type: application/json' -d '{
 "query":"mutation($in:CreateBookInput!){ createBook(input:$in){ book{id} userErrors{field message code} } }",
 "variables":{"in":{"title":"X","isbn":"bad","authorId":"a1","priceCents":100,"genre":"FANTASY"}}
}'
```

คาดหวัง: `book: null` และ `userErrors` มี `INVALID_ISBN`

### จุดที่ต้องมีใน `__resolveType`

```typescript
CatalogItem: {
 __resolveType(obj) {
 if ('isbn' in obj) return 'Book';
 if ('issueNumber' in obj) return 'Magazine';
 return null;
 },
},
```

ถ้าขาด `__resolveType` — runtime จะ error เมื่อ query interface/union

---

# Lab 3 — Breaking Change ในระบบจริง: เปลี่ยนราคาเป็นสตางค์

## สถานการณ์

ตอนนี้ REST `/v1/books` คืน:

```json
{ "id": "b1", "title": "Dune", "price": 450.0 }
```

ทีมการเงินพบ rounding bug จาก float จึงจะเปลี่ยนเป็น:

```json
{ "id": "b1", "title": "Dune", "priceCents": 45000 }
```

มี partner 12 รายใช้ `price` อยู่ และ GraphQL field `Book.price` ก็ถูกใช้ในแอปมือถือ

## สิ่งที่ต้องทำ

1. วางแผน migration สำหรับ **REST** (เลือก versioning strategy พร้อมเหตุผล)
2. วางแผน migration สำหรับ **GraphQL** (ใช้ `@deprecated` + field ใหม่)
3. กำหนด timeline: announce → dual-run → sunset
4. เขียนตัวอย่าง response/header/SDL ตามแผน
5. อธิบายว่าทำไม "เปลี่ยนเงียบๆ ใน v1" จึงไม่ควรทำ

---

## เฉลย Lab 3 — วิธีคิด

### REST Plan (แนะนำ URL versioning สำหรับ partner API)

| ระยะ        | การกระทำ                                                              |
| ----------- | --------------------------------------------------------------------- |
| T0          | ประกาศ changelog: `price` → `priceCents` ใน v2                        |
| T0          | ship `/v2/books/{id}` พร้อม `priceCents`                              |
| T0–T6 เดือน | dual-run: `/v1` ยังมี `price` แต่ใส่ `Deprecation` + `Sunset` headers |
| T6          | usage check — partner ที่ยังยิง v1 ถูก chase                          |
| T6+         | sunset `/v1` หรือคืน 410 Gone                                         |

ตัวอย่างจาก `versioning-rest.ts`:

```bash
cd 02-intermediate/src && npm run versioning
curl -i http://localhost:3200/v1/books/b1
# เห็น Deprecation / Sunset / Link successor
curl -i http://localhost:3200/v2/books/b1
# ได้ priceCents
```

ทางเลือก header versioning ใช้ได้ถ้าต้องการ URL เดียว — แต่ partner docs มักชัดกว่าด้วย `/v2`

### GraphQL Plan (evolutionary — ไม่เปิด `/v2/graphql`)

```graphql
type Book {
  price: Float @deprecated(reason: "Use priceCents. Removal on 2026-12-31")
  priceCents: Int!
}
```

ขั้นตอน:

1. เพิ่ม `priceCents` (additive — ไม่พังใคร)
2. Mark `price` เป็น `@deprecated`
3. แจ้ง mobile team + เปิด schema usage analytics
4. เมื่อ traffic ของ `price` ≈ 0 → ลบ field ใน major schema release ภายในองค์กร

Resolver ช่วง dual-run:

```typescript
Book: {
 price: (b) => b.priceCents / 100,
 priceCents: (b) => b.priceCents,
}
```

### ทำไมห้ามเปลี่ยนเงียบใน v1

- Client ที่ deserialize `price` เป็น float จะได้ `undefined` หรือ type error เมื่อเหลือแต่
  `priceCents`
- Cache/CDN อาจเก็บ representation เก่าปนใหม่
- ไม่มีสัญญาณให้ monitoring แยก breaking ได้ — incident จะโผล่เป็น data bug ที่ลูกค้าเจอก่อนทีม API

### ตารางเปรียบเทียบสั้นๆ

|                 | REST                             | GraphQL                    |
| --------------- | -------------------------------- | -------------------------- |
| พาหะของ version | `/v2` หรือ header/media type     | field ใหม่ + `@deprecated` |
| Dual-run        | สอง URL หรือสอง representation   | สอง fields คู่กัน          |
| สัญญาณเลิกใช้   | `Deprecation` / `Sunset` headers | `@deprecated(reason)`      |

---

## เกณฑ์ผ่าน Level 2

- [ ] เขียน OpenAPI ที่มี `$ref`, security และแยก request/response schema ได้
- [ ] ออกแบบ Input, Enum, Interface, Union และ Mutation payload ได้
- [ ] อธิบาย REST versioning 3 แบบ พร้อมเลือกใช้ตามบริบท
- [ ] วางแผน deprecate GraphQL field โดยไม่บังคับ `/v2`
- [ ] รัน `versioning-rest` และ `advanced-graphql-server` ผ่าน

ไปต่อที่ [`../03-expert/`](../03-expert/)
