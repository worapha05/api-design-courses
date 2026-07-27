# Level 1 — Beginner: API Paradigms & Resource Modeling

ระดับเริ่มต้นของ API Design Masterclass เป้าหมาย: เข้าใจปรัชญา REST กับ GraphQL, ออกแบบ Resource
อย่างเคร่งครัด และเขียน Schema/Resolver พื้นฐานได้

---

## สารบัญ

1. [ปรัชญาการออกแบบ API](#1-ปรัชญาการออกแบบ-api)
2. [Strict RESTful Design](#2-strict-restful-design)
3. [GraphQL Foundations](#3-graphql-foundations)
4. [เปรียบเทียบสถาปัตยกรรม](#4-เปรียบเทียบสถาปัตยกรรม)
5. [โครงสร้างข้อมูลและ Modeling](#5-โครงสร้างข้อมูลและ-modeling)
6. [Best Practices](#6-best-practices)
7. [ไฟล์ในระดับนี้](#7-ไฟล์ในระดับนี้)

---

## 1. ปรัชญาการออกแบบ API

### 1.1 API คือสัญญา ไม่ใช่แค่ Endpoint

API ที่ดีคือ **สัญญา (Contract)** ระหว่างผู้ให้บริการกับผู้บริโภคข้อมูล การเปลี่ยน shape ของ
response โดยไม่แจ้งล่วงหน้า = ทำลายสัญญา

ปรัชญาหลักสองสายที่ครองโลก API สมัยใหม่:

| มิติ                     | REST                                 | GraphQL                                                  |
| ------------------------ | ------------------------------------ | -------------------------------------------------------- |
| จุดศูนย์กลาง             | **Resource** (สิ่งของที่มี identity) | **Graph / Query** (กราฟของ Type และความสัมพันธ์)         |
| ใครกำหนด shape ของข้อมูล | Server (endpoint คงที่)              | Client (เลือก field ใน query)                            |
| การนำทาง                 | URL + Hypermedia (ถ้าทำ HATEOAS)     | Field → nested field ตาม schema                          |
| โปรโตคอลพาหะ             | HTTP เป็น first-class citizen        | มักใช้ HTTP POST ไปที่ endpoint เดียว                    |
| Cache ตามมาตรฐาน HTTP    | ดีเยี่ยม (GET + headers)             | ต้องออกแบบเพิ่ม (Persisted Query, CDN ที่เข้าใจ GraphQL) |

### 1.2 Resource-centric vs Query-centric

**REST (Resource-centric)** คิดว่าโลกคือชุดของ _ทรัพยากร_ ที่มี URI ประจำตัว:

```
GET /books/42  → ดึงหนังสือเลขที่ 42
PATCH /books/42  → แก้บางส่วนของหนังสือ 42
GET /books/42/reviews → รีวิวที่เป็นของหนังสือ 42
```

Client ไม่ได้ "ถามคำถามอิสระ" แต่เดินตาม path ที่ server ออกแบบไว้ล่วงหน้า

**GraphQL (Query-centric)** คิดว่าโลกคือ _กราฟของ Type_ ที่ client เดินสำรวจได้:

```graphql
query {
  book(id: "42") {
    title
    author {
      name
    }
    reviews(limit: 5) {
      rating
      body
    }
  }
}
```

Client ประกาศว่าต้องการอะไร — server คืนเฉพาะสิ่งที่ขอ (ลด over-fetching)

### 1.3 เมื่อไหร่ควรคิดแบบไหน

- ระบบ Partner API, Public CDN-heavy, CRUD ชัด → **REST ก่อน**
- Mobile/Web หลายหน้าจอ, ต้องการรวมหลาย resource ในครั้งเดียว, ทีม FE/BE แยก schema เป็นสัญญา →
  **GraphQL มีจุดแข็ง**
- หลายองค์กรใช้ **ทั้งสอง** ในระบบเดียวกัน (REST สำหรับ public, GraphQL สำหรับ BFF/internal)

---

## 2. Strict RESTful Design

### 2.1 URI ที่สะอาด

กฎพื้นฐาน:

| กฎ                                                    | ถูกต้อง                                                      | ผิด                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| ใช้ **plural nouns**                                  | `/books`, `/authors`                                         | `/book`, `/getBooks`                                              |
| Resource เป็นคำนาม ไม่ใช่คำกริยา                      | `/orders/123/cancel` เป็น RPC-style (หลีกเลี่ยงถ้าเป็นไปได้) | ใช้ `POST /orders/123/cancellations` หรือ state transition ที่ชัด |
| Hierarchy สะท้อนความเป็นเจ้าของ                       | `/books/42/reviews`                                          | `/reviews?bookId=42` ก็ใช้ได้ แต่ hierarchy สื่อ ownership ดีกว่า |
| ไม่ใส่ file extension                                 | `/books/42`                                                  | `/books/42.json`                                                  |
| Lowercase + kebab หรือ camel ตาม convention ขององค์กร | เลือกหนึ่งแล้วใช้ทั้งระบบ                                    | ผสม `BookItems` กับ `book_items`                                  |

ตัวอย่าง Bookstore API:

```
/books
/books/{bookId}
/books/{bookId}/reviews
/authors
/authors/{authorId}/books
```

### 2.2 HTTP Methods — ความหมายที่ต้องใช้ให้ถูก

| Method   | Semantics                 | Idempotent? | Safe? | ใช้เมื่อ                         |
| -------- | ------------------------- | ----------- | ----- | -------------------------------- |
| `GET`    | อ่าน                      | ✅          | ✅    | ดึง resource / collection        |
| `POST`   | สร้าง หรือ trigger action | ❌          | ❌    | สร้าง resource ใหม่ใน collection |
| `PUT`    | แทนที่ทั้ง resource       | ✅          | ❌    | client ส่ง representation เต็ม   |
| `PATCH`  | แก้บางส่วน                | ไม่บังคับ*  | ❌    | partial update                   |
| `DELETE` | ลบ                        | ✅          | ❌    | ลบ resource                      |

\* PATCH ที่ออกแบบดีมักทำให้ idempotent ได้ (เช่น JSON Merge Patch)

**อย่า** ใช้ `GET /books/delete?id=1` — ฝ่าฝืน Safe semantics และโดน cache/proxy ทำลายได้

### 2.3 Status Codes ที่ควรแม่น

| สถานการณ์                      | Code                                     |
| ------------------------------ | ---------------------------------------- |
| สำเร็จ + มี body               | `200 OK`                                 |
| สร้างสำเร็จ                    | `201 Created` (+ `Location` header)      |
| สำเร็จแต่ไม่มี body            | `204 No Content`                         |
| Validation ผิด / bad input     | `400 Bad Request`                        |
| ไม่ได้ authenticate            | `401 Unauthorized`                       |
| Authenticated แต่ไม่มีสิทธิ์   | `403 Forbidden`                          |
| ไม่พบ resource                 | `404 Not Found`                          |
| Conflict (เช่น duplicate ISBN) | `409 Conflict`                           |
| ไม่รองรับ media type / method  | `405` / `415`                            |
| Server error                   | `500` (อย่าปล่อย stack trace สู่ client) |

### 2.4 Query Parameters: Pagination, Sorting, Filtering

มาตรฐานที่แนะนำสำหรับ collection:

```
GET /books?page=1&pageSize=20
GET /books?sort=-publishedAt,title
GET /books?genre=fantasy&minPrice=100&maxPrice=500
GET /books?fields=id,title,authorId
```

รูปแบบ response ที่ดี:

```json
{
  "data": [/* items */],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 134,
    "totalPages": 7
  },
  "links": {
    "self": "/books?page=1&pageSize=20",
    "next": "/books?page=2&pageSize=20",
    "prev": null
  }
}
```

ทางเลือกขั้นสูง: **Cursor-based pagination** (`?cursor=eyJpZCI6NDJ9&limit=20`) —
เสถียรกว่าเมื่อข้อมูลเปลี่ยนบ่อย

### 2.5 Error Body ที่สม่ำเสมอ

ใช้รูปแบบคล้าย RFC 7807 Problem Details:

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "detail": "ISBN must be 13 digits",
  "instance": "/books",
  "errors": [{ "field": "isbn", "message": "must match pattern" }]
}
```

---

## 3. GraphQL Foundations

### 3.1 Type System หัวใจของ GraphQL

GraphQL ไม่ได้ "เป็น database" — มันคือ **Type System + Execution Engine** ที่อยู่เหนือ data sources

ประเภทพื้นฐาน:

| Kind            | ตัวอย่าง                                  | บทบาท                     |
| --------------- | ----------------------------------------- | ------------------------- |
| Scalar          | `String`, `Int`, `Float`, `Boolean`, `ID` | ค่าปลายทาง                |
| Object Type     | `type Book { ... }`                       | กลุ่ม fields              |
| Query           | `type Query { book(id: ID!): Book }`      | entry point อ่าน          |
| Mutation        | `type Mutation { createBook(...): Book }` | entry point เขียน         |
| List / Non-Null | `[Review!]!`                              | nullability & cardinality |

สัญลักษณ์ `!` = **non-nullable** — สัญญาว่า field นี้จะไม่เป็น `null` (ถ้าเป็น null จริง = error ใน
path นั้น)

### 3.2 Schema Definition Language (SDL) พื้นฐาน

```graphql
type Author {
  id: ID!
  name: String!
  books: [Book!]!
}

type Book {
  id: ID!
  title: String!
  isbn: String!
  author: Author!
  reviews: [Review!]!
}

type Review {
  id: ID!
  rating: Int!
  body: String
  book: Book!
}

type Query {
  book(id: ID!): Book
  books(limit: Int = 20): [Book!]!
  author(id: ID!): Author
}

type Mutation {
  createBook(title: String!, isbn: String!, authorId: ID!): Book!
  addReview(bookId: ID!, rating: Int!, body: String): Review!
}
```

### 3.3 กายวิภาคของ Request / Response

**Request:**

```http
POST /graphql HTTP/1.1
Content-Type: application/json

{
 "query": "query GetBook($id: ID!) { book(id: $id) { title author { name } } }",
 "variables": { "id": "42" },
 "operationName": "GetBook"
}
```

**Response สำเร็จ:**

```json
{
  "data": {
    "book": {
      "title": "Dune",
      "author": { "name": "Frank Herbert" }
    }
  }
}
```

**Response มี error บางส่วน (partial data):**

```json
{
  "data": {
    "book": {
      "title": "Dune",
      "author": null
    }
  },
  "errors": [
    {
      "message": "Author service unavailable",
      "path": ["book", "author"]
    }
  ]
}
```

แนวคิดสำคัญ: GraphQL สามารถคืน **data + errors พร้อมกัน** ได้ — ต่างจาก REST ที่มักเป็น
all-or-nothing ต่อ request

### 3.4 Resolver คืออะไร

Resolver คือ function ที่เติมค่าให้แต่ละ field:

```ts
const resolvers = {
  Query: {
    book: (_parent, args, context) => context.db.books.findById(args.id),
  },
  Book: {
    author: (book, _args, context) => context.db.authors.findById(book.authorId),
  },
};
```

ลำดับ execution โดยย่อ: Parse → Validate กับ Schema → Execute จาก root ลงไปตาม tree ของ selection
set

---

## 4. เปรียบเทียบสถาปัตยกรรม

```
┌──────────────── REST ────────────────┐ ┌────────────── GraphQL ──────────────┐
│ Client     │ │ Client    │
│ │ GET /books/1   │ │ │ POST /graphql { book {..}} │
│ │ GET /authors/9   │ │ ▼    │
│ │ GET /books/1/reviews  │ │ Single Endpoint   │
│ ▼     │ │ ▼    │
│ Multiple round-trips   │ │ Query Planner + Resolvers  │
│ Cache ได้ทีละ URL   │ │ หนึ่ง round-trip, shape ตาม query │
└─────────────────────────────────────────┘ └─────────────────────────────────────┘
```

| ความเสี่ยง REST                  | ความเสี่ยง GraphQL                     |
| -------------------------------- | -------------------------------------- |
| Over-fetching / Under-fetching   | Query ที่ลึก/แพง (DoS ผ่าน query)      |
| Chatty APIs (หลาย round-trip)    | N+1 ที่ resolver (ดูระดับ Expert)      |
| Versioning เจ็บปวดเมื่อ breaking | Schema ที่ "เติบโตโดยไม่ตัด" ต้องวินัย |

---

## 5. โครงสร้างข้อมูลและ Modeling

### 5.1 จาก Domain ไปสู่ Resource / Type

ขั้นตอนแนะนำ:

1. วาด **Domain nouns**: Book, Author, Review, Customer, Order
2. ระบุ **ความสัมพันธ์**: Book → belongsTo Author, Book → hasMany Reviews
3. ตัดสินใจ **identity**: อะไรมี ID ที่ client อ้างอิงได้
4. แยก **read model** กับ **write model** ถ้าจำเป็น (CQRS-lite)
5. Map ไป REST paths **หรือ** GraphQL types (หรือทั้งคู่)

### 5.2 ตัวอย่าง Bookstore Domain

```
Author 1 ──── * Book 1 ──── * Review
```

REST:

- Collection: `/books`
- Item: `/books/{id}`
- Sub-collection: `/books/{id}/reviews`

GraphQL:

- `Book.author`, `Book.reviews`, `Author.books` เป็น edges บนกราฟ

---

## 6. Best Practices

### REST

1. Plural nouns, ไม่ใส่ verb ใน path
2. ใช้ status code ตาม semantics ไม่ใช่ทุกอย่าง `200` พร้อม `{ success: false }`
3. Pagination + sorting + filter เป็น query params ที่ documented
4. Error format เดียวกันทั้งระบบ
5. อย่า leak internal DB id ถ้าไม่จำเป็น — พิจารณา UUID / ULID สำหรับ public id

### GraphQL

1. ตั้งชื่อ field ให้เป็น business language ไม่ใช่ชื่อ column DB
2. เริ่มด้วย non-null อย่างระมัดระวัง — การเปลี่ยน `String` → `String!` เป็น breaking ถ้าย้อนกลับ
3. ใช้ variables เสมอ อย่า concatenate string เข้า query (injection / cache miss)
4. แยก Query กับ Mutation ชัดเจน — อย่าใช้ Mutation เพื่ออ่านข้อมูล
5. Document ด้วย description ใน SDL (`""" ... """`)

### Cross-paradigm

- อย่าบังคับทุกอย่างเป็น GraphQL หรือ REST เพราะแฟชั่น — เลือกตาม client needs และ caching
- สัญญา (OpenAPI หรือ SDL) มาก่อน implementation เมื่อทำงานหลายทีม

---

## 7. ไฟล์ในระดับนี้

```
01-beginner/
├── README.md   ← คุณอยู่ที่นี่
├── LAB.md   ← โจทย์ + เฉลย
├── specs/
│ ├── openapi-bookstore.yaml
│ └── schema.graphql
└── src/
 ├── package.json
 ├── tsconfig.json
 ├── data.ts  ← in-memory store
 ├── rest-server.ts ← Strict REST Express API
 ├── graphql-schema.ts ← SDL string + typeDefs
 ├── resolvers.ts
 └── graphql-server.ts
```

รันตัวอย่าง:

```bash
cd 01-beginner/src
npm install
npx ts-node rest-server.ts    # http://localhost:3000
npx ts-node graphql-server.ts # http://localhost:4000/graphql
```
