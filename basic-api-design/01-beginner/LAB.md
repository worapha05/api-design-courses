# Lab — Level 1 Beginner: API Refactoring & GraphQL Foundations

โจทย์ทดสอบการปรับปรุงโครงสร้าง API ที่แย่, การออกแบบ Resource แบบ Strict REST และการเขียน GraphQL
Type System พื้นฐาน

**เวลาแนะนำ:** 3–5 ชั่วโมง **เครื่องมือ:** Node.js 18+, `curl`, ไฟล์ใน `src/` และ `specs/`

---

## สารบัญ Lab

| Lab   | หัวข้อ                                               | ความยาก |
| ----- | ---------------------------------------------------- | ------- |
| Lab 1 | Refactor "RPC-style" REST ให้เป็น Strict REST        | ⭐⭐    |
| Lab 2 | ออกแบบ GraphQL Schema + Resolvers จาก Domain         | ⭐⭐    |
| Lab 3 | แก้ปัญหา Over-fetching / Chatty API จากสถานการณ์จริง | ⭐⭐⭐  |

แต่ละ Lab มี **โจทย์ → วิธีคิด → โครงสร้างไฟล์ → โค้ดเฉลย**

---

# Lab 1 — Refactor API ที่แย่ให้เป็น Strict REST

## สถานการณ์

ทีมเก่าสร้าง "Order API" แบบ RPC ปะปน verb ใน URL ใช้ `GET` เพื่อลบ และคืน status `200` ทุกกรณี
พร้อม `{ success: false }`

ไฟล์จำลอง (อ่านแล้ว refactor ในหัวหรือสร้างไฟล์ใหม่):

```
01-beginner/src/lab1-bad-orders.ts ← สร้างตามโจทย์ด้านล่าง หรือดูเฉลย
01-beginner/src/lab1-good-orders.ts ← คำตอบของคุณ
```

## API ที่แย่ (โจทย์ตั้งต้น)

```http
GET /api/getAllOrders
GET /api/getOrder?id=9
POST /api/createOrder  body: {...}
GET /api/deleteOrder?id=9
POST /api/updateOrderStatus body: { id, status }
GET /api/getOrdersByUser?user=u1
```

Response ตัวอย่างที่แย่:

```json
{ "success": false, "error": "not found", "data": null }
```

(HTTP status ยังเป็น 200)

## สิ่งที่ต้องทำ

1. ออกแบบ URI ใหม่ตาม Strict REST (plural nouns, hierarchy)
2. เลือก HTTP method และ status code ที่ถูกต้อง
3. ออกแบบ query params สำหรับ pagination ของ collection
4. เขียน Express handler ชุดใหม่ (หรือ OpenAPI path) ที่สะท้อนสัญญาใหม่
5. อธิบายว่าทำไม `GET /deleteOrder` อันตราย

### Checkpoint คำถาม

- `POST /orders/9/cancel` กับ `POST /orders/9/cancellations` ต่างกันอย่างไรเชิง resource modeling?
- เมื่อไหร่ควรใช้ `PUT` vs `PATCH` สำหรับ update สถานะออเดอร์?

---

## เฉลย Lab 1 — วิธีคิด

### วิเคราะห์ปัญหาของ API เดิม

| ปัญหา                         | ทำไมแย่                                                |
| ----------------------------- | ------------------------------------------------------ |
| Verb ใน path (`getAllOrders`) | URI ควรเป็นชื่อ resource ไม่ใช่คำสั่ง                  |
| `GET` เพื่อลบ                 | ฝ่าฝืน Safe — cache/crawler อาจลบข้อมูล                |
| Status 200 + `success: false` | Client / proxy / monitoring อ่าน HTTP semantics ไม่ได้ |
| Query `?id=` สำหรับ item      | Item ควรมี identity ใน path: `/orders/{id}`            |

### Resource Model เป้าหมาย

```
Order (collection) /orders
Order (item)  /orders/{orderId}
Order status (ส่วนหนึ่งของ Order หรือ sub-resource)
Orders by customer /customers/{customerId}/orders
   หรือ /orders?customerId=
```

สำหรับการเปลี่ยนสถานะ (state transition) ที่เป็น business action:

- **ตัวเลือก A:** `PATCH /orders/{id}` ด้วย `{ "status": "CANCELLED" }` — เหมาะถ้า status เป็น field
- **ตัวเลือก B:** `POST /orders/{id}/cancellations` — เหมาะถ้าการยกเลิกสร้าง "เหตุการณ์/เอกสาร"
  (cancellation record) และอาจมี side effects (refund)

### Mapping ใหม่

| เดิม                               | ใหม่                                                        | Status          |
| ---------------------------------- | ----------------------------------------------------------- | --------------- |
| `GET /api/getAllOrders`            | `GET /orders?page=&pageSize=`                               | 200             |
| `GET /api/getOrder?id=9`           | `GET /orders/9`                                             | 200 / 404       |
| `POST /api/createOrder`            | `POST /orders`                                              | 201 + Location  |
| `GET /api/deleteOrder?id=9`        | `DELETE /orders/9`                                          | 204 / 404       |
| `POST /api/updateOrderStatus`      | `PATCH /orders/9`                                           | 200 / 404 / 409 |
| `GET /api/getOrdersByUser?user=u1` | `GET /customers/u1/orders` หรือ `GET /orders?customerId=u1` | 200             |

### โครงสร้างไฟล์เฉลย

```
01-beginner/src/
├── lab1-good-orders.ts ← Express routes ที่ refactor แล้ว
└── ../specs/ (อ้างอิงแนว openapi-bookstore.yaml)
```

### โค้ดเฉลย (สรุป)

สร้างไฟล์ `lab1-good-orders.ts`:

```typescript
import express from 'express';

type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED';

interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  total: number;
}

const orders: Order[] = [
  { id: '9', customerId: 'u1', status: 'PENDING', total: 1200 },
  { id: '10', customerId: 'u1', status: 'PAID', total: 450 },
  { id: '11', customerId: 'u2', status: 'SHIPPED', total: 890 },
];

const app = express();
app.use(express.json());

function problem(res: express.Response, status: number, title: string, detail: string) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://api.example.com/errors/${status}`,
      title,
      status,
      detail,
    });
}

// GET /orders?page=&pageSize=&customerId=&status=
app.get('/orders', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  let result = [...orders];
  if (typeof req.query.customerId === 'string') {
    result = result.filter((o) => o.customerId === req.query.customerId);
  }
  if (typeof req.query.status === 'string') {
    result = result.filter((o) => o.status === req.query.status);
  }
  const totalItems = result.length;
  const start = (page - 1) * pageSize;
  res.status(200).json({
    data: result.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize) || 1,
    },
  });
});

app.get('/orders/:orderId', (req, res) => {
  const order = orders.find((o) => o.id === req.params.orderId);
  if (!order) return problem(res, 404, 'Not Found', 'Order not found');
  res.status(200).json(order);
});

app.post('/orders', (req, res) => {
  const { customerId, total } = req.body ?? {};
  if (!customerId || typeof total !== 'number') {
    return problem(res, 400, 'Validation Failed', 'customerId and total required');
  }
  const order: Order = {
    id: String(Date.now()),
    customerId,
    status: 'PENDING',
    total,
  };
  orders.push(order);
  res.status(201).location(`/orders/${order.id}`).json(order);
});

app.patch('/orders/:orderId', (req, res) => {
  const order = orders.find((o) => o.id === req.params.orderId);
  if (!order) return problem(res, 404, 'Not Found', 'Order not found');
  const { status } = req.body ?? {};
  const allowed: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED'];
  if (!allowed.includes(status)) {
    return problem(res, 400, 'Validation Failed', 'invalid status');
  }
  if (order.status === 'CANCELLED' && status !== 'CANCELLED') {
    return problem(res, 409, 'Conflict', 'cannot reopen cancelled order');
  }
  order.status = status;
  res.status(200).json(order);
});

app.delete('/orders/:orderId', (req, res) => {
  const idx = orders.findIndex((o) => o.id === req.params.orderId);
  if (idx < 0) return problem(res, 404, 'Not Found', 'Order not found');
  orders.splice(idx, 1);
  res.status(204).send();
});

app.get('/customers/:customerId/orders', (req, res) => {
  const data = orders.filter((o) => o.customerId === req.params.customerId);
  res.status(200).json({ data });
});

app.listen(3100, () => console.log('Refactored Orders API on :3100'));
```

**คำตอบสั้นๆ เรื่อง GET delete:** `GET` ถูกนิยามว่า Safe และ Idempotent สำหรับการอ่าน — proxy,
prefetch, crawler สามารถเรียกซ้ำได้โดยไม่ควรมี side effect การลบผ่าน GET จึงเป็นช่องโหว่และผิดสัญญา
HTTP

**PUT vs PATCH สำหรับ status:** ถ้า client ส่งทั้ง Order representation → `PUT` ถ้าส่งเฉพาะ
`{ status }` → `PATCH` (หรือ POST ไปที่ cancellations sub-resource)

---

# Lab 2 — ออกแบบ GraphQL Type System จาก Domain

## สถานการณ์

startup "CourseHub" มี domain:

- **Instructor** สอนหลาย **Course**
- **Course** มีหลาย **Lesson**
- **Student** enroll หลาย Course (many-to-many)
- ต้องการ query: ดูคอร์ส พร้อม instructor และจำนวนนักเรียน
- ต้องการ mutation: สร้างคอร์ส และ enroll นักเรียน

## สิ่งที่ต้องทำ

1. เขียน SDL ใน `specs/lab2-coursehub.graphql`
2. Implement resolvers ใน `src/lab2-resolvers.ts` (ใช้ in-memory ได้)
3. ออกแบบ nullability ให้รอบคอบ (`Course.title` ควร `String!` หรือไม่?)
4. เขียนตัวอย่าง query / mutation payload

### Checkpoint

- ทำไม `enrollments` บน Student กับ `students` บน Course ถึงสะท้อน many-to-many ได้โดยไม่ต้องมี join
  table ใน schema (แม้ storage จะมี)?
- Mutation ควรคืน `Course` โดยตรง หรือคืน payload type เช่น `EnrollPayload`?

---

## เฉลย Lab 2 — วิธีคิด

### Modeling

```
Instructor 1 ─── * Course 1 ─── * Lesson
Student * ─── * Course (ผ่าน Enrollment ใน storage)
```

ใน GraphQL มัก **ซ่อน join entity** ถ้าไม่มี field พิเศษ — แต่ถ้ามี `enrolledAt`, `progress` ควรมี
type `Enrollment`

### SDL เฉลย

สร้าง `specs/lab2-coursehub.graphql`:

```graphql
type Instructor {
  id: ID!
  name: String!
  courses: [Course!]!
}

type Course {
  id: ID!
  title: String!
  description: String
  instructor: Instructor!
  lessons: [Lesson!]!
  students: [Student!]!
  enrollmentCount: Int!
}

type Lesson {
  id: ID!
  title: String!
  durationMinutes: Int!
  course: Course!
}

type Student {
  id: ID!
  name: String!
  email: String!
  courses: [Course!]!
}

type Query {
  course(id: ID!): Course
  courses(limit: Int = 20): [Course!]!
  student(id: ID!): Student
}

type Mutation {
  createCourse(title: String!, instructorId: ID!, description: String): Course!
  enrollStudent(courseId: ID!, studentId: ID!): EnrollmentResult!
}

"""
Payload ชัดเจนกว่าคืน Course เปล่าๆ เมื่อมี side-effect metadata
"""
type EnrollmentResult {
  success: Boolean!
  course: Course
  student: Student
  message: String
}
```

### Nullability strategy

| Field                | เลือก               | เหตุผล                                     |
| -------------------- | ------------------- | ------------------------------------------ |
| `Course.title`       | `String!`           | ธุรกิจบังคับมีชื่อ                         |
| `Course.description` | `String`            | อาจยังไม่กรอก                              |
| `course(id:)`        | `Course` (nullable) | ไม่พบ = null ดีกว่า error                  |
| `createCourse`       | `Course!`           | สำเร็จต้องคืน object — ล้มเหลว throw/error |

### Resolver โครงร่าง

```typescript
// src/lab2-resolvers.ts (แนวทาง)
const enrollments: { courseId: string; studentId: string }[] = [];

export const lab2Resolvers = {
  Query: {
    course: (_: unknown, { id }: { id: string }) => courses.find((c) => c.id === id) ?? null,
    courses: (_: unknown, { limit }: { limit: number }) => courses.slice(0, limit),
  },
  Mutation: {
    enrollStudent: (
      _: unknown,
      { courseId, studentId }: { courseId: string; studentId: string },
    ) => {
      const course = courses.find((c) => c.id === courseId);
      const student = students.find((s) => s.id === studentId);
      if (!course || !student) {
        return {
          success: false,
          message: 'course or student not found',
          course: null,
          student: null,
        };
      }
      if (!enrollments.some((e) => e.courseId === courseId && e.studentId === studentId)) {
        enrollments.push({ courseId, studentId });
      }
      return { success: true, course, student, message: 'enrolled' };
    },
  },
  Course: {
    instructor: (c: { instructorId: string }) => instructors.find((i) => i.id === c.instructorId),
    students: (c: { id: string }) =>
      enrollments
        .filter((e) => e.courseId === c.id)
        .map((e) => students.find((s) => s.id === e.studentId)!)
        .filter(Boolean),
    enrollmentCount: (c: { id: string }) => enrollments.filter((e) => e.courseId === c.id).length,
  },
};
```

### ตัวอย่าง Request / Response

```graphql
mutation {
  enrollStudent(courseId: "c1", studentId: "s1") {
    success
    message
    course {
      title
      enrollmentCount
    }
    student {
      name
    }
  }
}
```

```json
{
  "data": {
    "enrollStudent": {
      "success": true,
      "message": "enrolled",
      "course": { "title": "API Design", "enrollmentCount": 1 },
      "student": { "name": "Ada" }
    }
  }
}
```

**ทำไมไม่โชว์ join table:** GraphQL เป็น _presentation/query graph_ ไม่จำเป็นต้อง mirror ER ทุกตัว —
expose field ที่ client ใช้จริง

**ทำไมใช้ EnrollmentResult:** สื่อ success/message ได้โดยไม่ต้องพึ่ง HTTP status (GraphQL มักเป็น
200 เสมอ) และขยาย field ในอนาคตได้โดยไม่ breaking

---

# Lab 3 — สถานการณ์จริง: Mobile App ที่ช้าเพราะ Chatty REST

## สถานการณ์

แอปมือถือ "BookShelf" เปิดหน้าหนังสือหนึ่งเล่ม แล้วยิงทีละ request:

```
1) GET /books/b1
2) GET /authors/a1  (จาก authorId ในข้อ 1)
3) GET /books/b1/reviews
4) สำหรับ reviewer แต่ละคน → GET /users/{id} ← N+1 แบบ REST
```

บน 3G ใช้เวลา ~1.8 วินาที ผู้ใช้บ่นว่า "แอปหน่วง"

## สิ่งที่ต้องทำ

1. เสนอ **อย่างน้อย 2 ทางเลือกสถาปัตยกรรม** เพื่อลด round-trip
2. เขียน GraphQL query ที่ดึงข้อมูลหน้าเดียวในครั้งเดียว
3. (ทางเลือก REST) ออกแบบ **BFF endpoint** หรือ composite resource ที่สมเหตุสมผล โดยไม่ออกแบบ God
   endpoint
4. อธิบาย trade-off ของแต่ละทาง

---

## เฉลย Lab 3 — วิธีคิด

### ทางเลือกสถาปัตยกรรม

| ทางเลือก              | แนวทาง                                 | ข้อดี                                 | ข้อเสีย                                       |
| --------------------- | -------------------------------------- | ------------------------------------- | --------------------------------------------- |
| **A. GraphQL**        | query เดียวเลือก fields                | ยืดหยุ่นต่อหน้าจอ                     | ต้องมี GraphQL stack + ระวัง N+1 ที่ resolver |
| **B. REST BFF**       | `GET /mobile/books/{id}/page`          | ง่ายต่อ cache ราย URL, ควบคุม payload | endpoint ต่อ client/use-case                  |
| **C. Embed / expand** | `GET /books/b1?include=author,reviews` | อยู่ใน REST ecosystem                 | ซับซ้อนเร็ว, cache key แตก                    |

### GraphQL Query เฉลย

```graphql
query BookShelfPage($id: ID!) {
  book(id: $id) {
    title
    price
    genre
    author {
      name
      bio
    }
    reviews {
      rating
      body
    }
  }
}
```

ตัวแปร:

```json
{ "id": "b1" }
```

ใช้กับ server ใน `src/graphql-server.ts` ได้ทันทีหลัง `npm install && npm run graphql`

### REST BFF เฉลย (ไม่ใช่ God API)

```http
GET /mobile/v1/books/{bookId}/summary
```

Response เฉพาะหน้า BookShelf:

```json
{
  "book": { "id": "b1", "title": "Dune", "price": 450 },
  "author": { "name": "Frank Herbert", "bio": "..." },
  "reviews": [{ "rating": 5, "body": "Epic world-building" }]
}
```

หลักการ: BFF รวมข้อมูล **ตาม use-case ของ client** ไม่ใช่รวมทุกอย่างในระบบเข้า endpoint เดียว

### ทดสอบกับ Beginner servers

```bash
# Terminal 1
cd 01-beginner/src && npm install && npm run rest

# Terminal 2 — chatty (จำลองปัญหา)
curl -s http://localhost:3000/books/b1
curl -s http://localhost:3000/authors
curl -s http://localhost:3000/books/b1/reviews

# Terminal 3 — GraphQL รวมครั้งเดียว
cd 01-beginner/src && npm run graphql
curl -s http://localhost:4000/ -H 'content-type: application/json' -d '{
 "query":"query($id:ID!){ book(id:$id){ title author{name} reviews{rating} } }",
 "variables":{"id":"b1"}
}'
```

### สรุป Decision

- Mobile หลายหน้าจอ / field ต่างกันมาก → GraphQL หรือ BFF ต่อ platform
- ต้องการ CDN cache ง่าย + public API → REST + optional `include`
- อย่าแก้ chatty ด้วยการยัดทุก relation ในทุก REST response โดยค่าเริ่มต้น — จะสร้าง over-fetching
  แทน

---

## เกณฑ์ผ่าน Level 1

- [ ] Refactor RPC paths เป็น resource URIs และอธิบาย status codes ได้
- [ ] เขียน SDL มี Query/Mutation/Object types และอธิบาย `!` ได้
- [ ] เสนอทางแก้ chatty API ได้อย่างน้อย 2 แบบ พร้อม trade-off
- [ ] รัน `rest-server` และ `graphql-server` แล้วทดสอบด้วย curl สำเร็จ

เมื่อผ่านแล้ว ไปต่อที่ [`../02-intermediate/`](../02-intermediate/)
