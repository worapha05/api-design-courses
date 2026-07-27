# Level 2 — Intermediate: API Contracts, Schemas & Lifecycle Control

ระดับกลางของ API Design Masterclass เป้าหมาย: ออกแบบ Contract-first ด้วย OpenAPI v3, เขียน GraphQL
Schema ขั้นสูง และบริหาร API Lifecycle / Versioning ได้อย่างมืออาชีพ

---

## สารบัญ

1. [Contract-First กับ OpenAPI v3](#1-contract-first-กับ-openapi-v3)
2. [Advanced GraphQL Engineering](#2-advanced-graphql-engineering)
3. [Mutation Payloads และ Nullability Strategy](#3-mutation-payloads-และ-nullability-strategy)
4. [API Lifecycle & Versioning](#4-api-lifecycle--versioning)
5. [เปรียบเทียบวิวัฒนาการ REST vs GraphQL](#5-เปรียบเทียบวิวัฒนาการ-rest-vs-graphql)
6. [Best Practices](#6-best-practices)
7. [ไฟล์ในระดับนี้](#7-ไฟล์ในระดับนี้)

---

## 1. Contract-First กับ OpenAPI v3

### 1.1 ทำไมต้อง Contract-First

**Code-first:** เขียนโค้ด → generate docs **Contract-first:** ออกแบบสัญญา (OpenAPI / SDL) → generate
stubs, mocks, tests, client SDKs

ข้อดีของ contract-first ในองค์กร:

- FE / Partner / QA ทำงานขนานกับ BE ได้ทันทีจาก mock
- Breaking change ถูกจับตอน review spec ไม่ใช่ตอน production
- Codegen ลดงานมือที่ผิดพลาด (TypeScript types, Zod validators)

### 1.2 โครงสร้าง OpenAPI v3 ที่ควรรู้

```yaml
openapi: 3.0.3
info: { title, version, description }
servers: [...]
tags: [...]
paths:  # endpoints
 /resources:
 get: ...
components:
 schemas: # reusable models
 parameters:
 responses:
 requestBodies:
 securitySchemes # auth
security: [...] # global หรือ per-operation
```

หลักการสำคัญ:

| แนวทาง                               | รายละเอียด                                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| **DRY ด้วย `$ref`**                  | นิยาม `Book`, `Problem`, `Page` ครั้งเดียว แล้วอ้างซ้ำ       |
| **แยก request / response schema**    | `CreateBookRequest` ≠ `Book` (server เติม `id`, `createdAt`) |
| **อธิบาย auth ใน `securitySchemes`** | bearer JWT, API key, OAuth2 — อย่าซ่อนใน wiki                |
| **Examples ใน spec**                 | ช่วยทั้งมนุษย์และเครื่องมือ mock                             |

### 1.3 Authentication Definitions

```yaml
components:
  securitySchemes:
  bearerAuth:
  type: http
  scheme: bearer
  bearerFormat: JWT
  apiKeyAuth:
  type: apiKey
  in: header
  name: X-API-Key
  oauth2:
  type: oauth2
  flows:
  authorizationCode:
    authorizationUrl: https://auth.example.com/authorize
    tokenUrl: https://auth.example.com/token
    scopes:
    books:read: Read books
    books:write: Create/update books

security:
  - bearerAuth: []
```

ต่อ operation สามารถ override:

```yaml
paths:
  /health:
  get:
  security: [] # public
  /books:
  post:
  security:
    - bearerAuth: []
    - oauth2: [books:write]
```

### 1.4 Path Descriptions ที่ดี

อย่าเขียนแค่ "Get book" — ใส่:

- precondition (ต้อง login หรือไม่)
- idempotency notes
- error cases สำคัญ (409 เมื่อ ISBN ซ้ำ)
- pagination semantics

ดูตัวอย่างเต็มใน `specs/openapi-bookstore-v3.yaml`

---

## 2. Advanced GraphQL Engineering

### 2.1 Input Types

อย่าใส่ argument ยาวเป็นชุดบน Mutation — ห่อด้วย Input:

```graphql
input CreateBookInput {
  title: String!
  isbn: String!
  authorId: ID!
  price: Float!
  genre: Genre!
  tags: [String!]
}

type Mutation {
  createBook(input: CreateBookInput!): CreateBookPayload!
}
```

ข้อดี: เพิ่ม field ใน input ได้แบบ additive, อ่านง่าย, reuse ข้าม mutations

### 2.2 Enums

```graphql
enum Genre {
  SCIENCE_FICTION
  FANTASY
  NON_FICTION
  MYSTERY
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  CANCELLED
}
```

Enum ใน GraphQL เป็น **closed set** — การลบค่า = breaking change สำหรับ client ที่ยังใช้ค่านั้น

### 2.3 Interfaces

ใช้เมื่อหลาย type มี fields ร่วมและอยาก query แบบ polymorphic:

```graphql
interface Node {
  id: ID!
}

interface CatalogItem {
  id: ID!
  title: String!
  price: Float!
}

type Book implements Node & CatalogItem {
  id: ID!
  title: String!
  price: Float!
  isbn: String!
}

type Magazine implements Node & CatalogItem {
  id: ID!
  title: String!
  price: Float!
  issueNumber: Int!
}

type Query {
  node(id: ID!): Node
  search(q: String!): [CatalogItem!]!
}
```

Client ใช้ inline fragments:

```graphql
{
  search(q: "dune") {
    title
    price
    ... on Book {
      isbn
    }
    ... on Magazine {
      issueNumber
    }
  }
}
```

### 2.4 Union Types

Union = หนึ่งในหลาย type **โดยไม่บังคับ shared fields** (ต่างจาก Interface):

```graphql
union SearchResult = Book | Author | Review

type MutationPayloadError {
  code: String!
  message: String!
}

union CreateBookResult = Book | MutationPayloadError
```

เหมาะกับผลลัพธ์ที่ต่างกันมาก หรือ error-as-data patterns

### 2.5 Resolver Map สำหรับ Interface / Union

ต้องมี `__resolveType`:

```ts
CatalogItem: {
 __resolveType(obj: { isbn?: string; issueNumber?: number }) {
 if (obj.isbn) return 'Book';
 if (obj.issueNumber !== undefined) return 'Magazine';
 return null;
 },
},
```

---

## 3. Mutation Payloads และ Nullability Strategy

### 3.1 Mutation Payload Pattern

แทนการคืน object ตรงๆ หรือ throw อย่างเดียว — ใช้ payload:

```graphql
type CreateBookPayload {
  book: Book
  userErrors: [UserError!]!
  clientMutationId: String
}

type UserError {
  field: [String!]
  message: String!
}
```

ข้อดีในระดับองค์กร:

- Validation errors เป็น **data** ไม่ใช่ transport error — client ผูกกับ form ได้ง่าย
- ขยาย metadata (เช่น `clientMutationId` สำหรับ idempotency) ได้โดยไม่ breaking
- สอดคล้องกับแนว Relay / GitHub GraphQL style

### 3.2 Nullable vs Non-Null — กลยุทธ์

| สถานการณ์                                      | คำแนะนำ                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| Business-required field ที่ไม่หาย              | `String!`                                             |
| Field ที่พึ่ง service อื่น / อาจ fail บางส่วน  | nullable (`Author`) เพื่อให้ partial data รอด         |
| List ที่ไม่เคยเป็น null แต่รายการข้างในอาจว่าง | `[Item!]!` = list ไม่ว่างเป็น null, item ไม่เป็น null |
| การเปลี่ยน `T` → `T!`                          | มักปลอดภัย (แคบลง) ถ้า server รับประกันได้            |
| การเปลี่ยน `T!` → `T`                          | **breaking** สำหรับ client ที่ไม่เช็ค null            |

กฎทอง: **เริ่มต้น nullable เมื่อไม่แน่ใจ** แล้วค่อยรัด `!` เมื่อสัญญาชัด — หรือกลับกันในทีมที่
control client ทั้งหมดและอยาก fail-fast

### 3.3 Error เป็น Exception vs Error เป็น Data

```
throw GraphQLError → อยู่ใน errors[] ของ response, field เป็น null
userErrors ใน payload → อยู่ใน data, HTTP/GraphQL transport สำเร็จ
```

ใช้ `userErrors` สำหรับ expected failures (validation, business rule) ใช้ `errors[]` สำหรับ
unexpected / auth / infra

---

## 4. API Lifecycle & Versioning

### 4.1 REST Versioning Strategies

#### A) URL Versioning (นิยมสุดใน public API)

```
https://api.example.com/v1/books
https://api.example.com/v2/books
```

| ข้อดี                             | ข้อเสีย                                         |
| --------------------------------- | ----------------------------------------------- |
| ชัดเจน, cache ง่าย, เอกสารแยกง่าย | URL เปลี่ยน, duplicate routes, คนมักค้าง v1 นาน |

#### B) Custom Header

```http
GET /books
X-API-Version: 2
```

| ข้อดี     | ข้อเสีย                                                          |
| --------- | ---------------------------------------------------------------- |
| URL สะอาด | cache key ซับซ้อน, ค้นหาใน logs ยากกว่า, explorer บางตัวไม่สะดวก |

#### C) Media Type Versioning (Accept)

```http
GET /books
Accept: application/vnd.bookstore.v2+json
```

| ข้อดี                                 | ข้อเสีย                                        |
| ------------------------------------- | ---------------------------------------------- |
| สอดคล้อง content negotiation ของ HTTP | Client ทำผิดง่าย, tooling น้อยกว่า URL version |

**คำแนะนำปฏิบัติ:** Public/Partner API → URL `/v1` Internal microservices ที่เปลี่ยนบ่อย → header
หรือไม่ version แล้วใช้ additive + deprecation window

### 4.2 Deprecation ใน REST

```yaml
paths:
 /v1/books/{id}/full:
 get:
 deprecated: true
 description: |
 Deprecated since 2026-01. Use GET /v2/books/{id} instead.
 Sunset date: 2026-12-31.
```

ส่ง header:

```http
Deprecation: true
Sunset: Sat, 31 Dec 2026 23:59:59 GMT
Link: </v2/books/{id}>; rel="successor-version"
```

### 4.3 GraphQL Evolutionary Model

GraphQL **หลีกเลี่ยง version ใหญ่ใน URL** โดยหลักการ:

1. **Additive changes เท่านั้นเป็นค่าเริ่มต้น** — เพิ่ม field, เพิ่ม type, เพิ่ม optional input
   field
2. **อย่าลบหรือเปลี่ยนความหมาย field** โดยไม่ deprecate
3. ใช้ `@deprecated`:

```graphql
type Book {
  title: String!
  price: Float! @deprecated(reason: "Use priceCents instead")
  priceCents: Int!
}
```

4. Client tooling (Apollo, GraphQL Codegen) เตือน field ที่ deprecate ได้ตอน build

Breaking changes ที่ควรหลีกเลี่ยงใน GraphQL:

- ลบ field / enum value
- เปลี่ยนชนิด field
- เปลี่ยน `T` เป็น `T!` ใน **argument** (บังคับมากขึ้น = อาจพัง client เก่า)
- เปลี่ยน nullable field เป็น non-null ใน response มักโอเคถ้าข้อมูลจริงไม่มี null

---

## 5. เปรียบเทียบวิวัฒนาการ REST vs GraphQL

```
REST lifecycle:
 design v1 → publish → break? → ship /v2 → migrate clients → sunset v1

GraphQL lifecycle:
 design schema → add fields → deprecate old → monitor usage → remove after window
 (มักอยู่ที่ endpoint เดียว /graphql โดยไม่ขึ้น /v2)
```

| คำถาม                           | REST                                    | GraphQL                                       |
| ------------------------------- | --------------------------------------- | --------------------------------------------- |
| Client เก่าพังเมื่อเพิ่ม field? | ไม่ (ถ้าไม่บังคับ field ใหม่ใน request) | ไม่                                           |
| Client เก่าพังเมื่อลบ field?    | ถ้าใช้ field นั้น → พัง                 | เหมือนกัน — ต้อง deprecate ก่อน               |
| หลาย version คู่ขนาน            | ทำได้ชัดด้วย /v1 /v2                    | ทำได้แต่ไม่นิยม; ใช้ field-level แทน          |
| เอกสาร migration                | OpenAPI + changelog                     | Schema diff + `@deprecated` + usage analytics |

---

## 6. Best Practices

### OpenAPI

1. Version ใน `info.version` (semver ของสัญญา) แยกจาก URL version ของ API
2. ใช้ `components.schemas` จริงจัง — ห้าม copy-paste object ยาวซ้ำ
3. ระบุ `security` ให้ครบทุก operation ที่ต้องการป้องกัน
4. ใส่ `examples` สำหรับ happy path และ validation error
5. CI: spectral / openapi-diff เพื่อกัน breaking change โดยไม่ตั้งใจ

### GraphQL Advanced

1. Input types สำหรับทุก mutation ที่ซับซ้อน
2. Payload + `userErrors` สำหรับ business validation
3. Interface เมื่อมี shared contract; Union เมื่อผลลัพธ์ต่างกันโดยไม่มี shared fields
4. Document ด้วย `"""descriptions"""` — เป็น public docs ของคุณ
5. Schema change review เหมือน DB migration review

### Lifecycle

1. ประกาศ deprecation window ชัด (เช่น 6–12 เดือน)
2. วัด usage ก่อนลบ field / sunset version
3. อย่าทำ breaking change เงียบๆ ใน patch release ของ library client

---

## 7. ไฟล์ในระดับนี้

```
02-intermediate/
├── README.md
├── LAB.md
├── specs/
│ ├── openapi-bookstore-v3.yaml ← contract-first + auth + reusable schemas
│ └── advanced-schema.graphql ← Input, Enum, Interface, Union, Payloads
└── src/
 ├── package.json
 ├── tsconfig.json
 ├── data.ts
 ├── versioning-rest.ts  ← demo URL vs Header vs Media-Type versioning
 ├── advanced-resolvers.ts
 └── advanced-graphql-server.ts
```

รันตัวอย่าง:

```bash
cd 02-intermediate/src
npm install
npx ts-node versioning-rest.ts         # :3200
npx ts-node advanced-graphql-server.ts # :4001
```

เปิด `specs/openapi-bookstore-v3.yaml` ใน [Swagger Editor](https://editor.swagger.io/)
เพื่อสำรวจสัญญา
