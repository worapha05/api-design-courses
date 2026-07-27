# Lab ระดับ Beginner — ระบบแคตตาล็อก “NovaShelf”

## เป้าหมาย

สร้างระบบ API คู่ขนานสำหรับร้านหนังสือจำลอง **NovaShelf**:

- ออกแบบ **GraphQL Schema** (Query + Mutation) สำหรับหนังสือและรีวิว
- สร้าง **gRPC Unary service** ด้วย Protocol Buffers สำหรับ Inventory
- ให้ GraphQL และ gRPC ใช้ **แหล่งข้อมูลร่วม** (in-memory) เพื่อเห็นความต่างของ contract

ทำด้วยตัวเองก่อน แล้วค่อยเทียบกับ [`lab/solution/`](./src/lab/solution/)

---

## กรณีศึกษา

startup **NovaShelf** มีหน้าเว็บที่ต้องการดึงข้อมูลยืดหยุ่น และมีบริการคลังสินค้าภายในที่ต้องการ RPC
เร็ว ๆ

CTO ต้องการ:

1. **GraphQL BFF** สำหรับ frontend — query หนังสือพร้อมรีวิวในครั้งเดียว
2. **gRPC InventoryService** สำหรับระบบคลังภายใน — `GetStock` / `AdjustStock`
3. สองระบบอ่านเขียน stock จาก store เดียวกัน (จำลอง shared DB)

---

## โจทย์

### ส่วนที่ 1 — GraphQL Schema & Server

สร้าง schema อย่างน้อย:

```graphql
type Book {
  id: ID!
  title: String!
  author: String!
  price: Float!
  stock: Int!
  reviews: [Review!]!
}

type Review {
  id: ID!
  rating: Int!
  comment: String!
  bookId: ID!
}

type Query {
  book(id: ID!): Book
  books: [Book!]!
}

type Mutation {
  addReview(bookId: ID!, rating: Int!, comment: String!): Review!
}
```

ข้อกำหนด:

1. `rating` ต้องอยู่ระหว่าง 1–5 มิฉะนั้น throw error
2. `addReview` ต้อง fail ถ้า `bookId` ไม่มี
3. Seed หนังสืออย่างน้อย 3 เล่ม และรีวิวอย่างน้อย 2 รายการ
4. รันที่ port **4400**

ทดสอบ query:

```graphql
{
  books {
    title
    stock
    reviews {
      rating
      comment
    }
  }
}
```

### ส่วนที่ 2 — Protocol Buffers + Unary gRPC

สร้าง `inventory.proto`:

```protobuf
syntax = "proto3";
package novashelf.v1;

message Stock {
 string book_id = 1;
 int32 quantity = 2;
}

message GetStockRequest { string book_id = 1; }
message AdjustStockRequest {
 string book_id = 1;
 int32 delta = 2; // บวกหรือลบ
}

service InventoryService {
 rpc GetStock(GetStockRequest) returns (Stock);
 rpc AdjustStock(AdjustStockRequest) returns (Stock);
}
```

ข้อกำหนด:

1. `GetStock` คืน `NOT_FOUND` ถ้าไม่มีหนังสือ
2. `AdjustStock` ห้ามให้ quantity ติดลบ — ใช้ `FAILED_PRECONDITION` หรือ `INVALID_ARGUMENT`
3. เมื่อ adjust สำเร็จ ค่า `stock` ใน GraphQL ต้องเปลี่ยนตาม (shared store)
4. รัน gRPC ที่ port **50051**

### ส่วนที่ 3 — Client สาธิต

เขียน script ที่:

1. เรียก GraphQL `books` แสดง stock
2. เรียก gRPC `AdjustStock` ลด stock หนังสือเล่มหนึ่ง
3. เรียก GraphQL อีกครั้งเพื่อยืนยันว่า stock เปลี่ยน

### ส่วนที่ 4 — คำถามคิด (ตอบใน `NOTES.md`)

1. ทำไม frontend ถึงเหมาะกับ GraphQL มากกว่าเรียก gRPC โดยตรง?
2. ถ้าเพิ่ม field `isbn` ใน GraphQL แต่ยังไม่ใส่ใน proto — มีปัญหาอะไรหรือไม่?
3. การใช้ field number ใน Protobuf ผิดพลาด (reuse หมายเลขเก่า) อันตรายอย่างไร?

---

## เกณฑ์ผ่าน

- [ ] GraphQL query/mutation ทำงานตาม schema
- [ ] gRPC GetStock / AdjustStock ทำงานและส่ง status ถูก
- [ ] Shared store ทำให้สองโปรโตคอลเห็นข้อมูลสอดคล้องกัน
- [ ] มี `NOTES.md` ตอบคำถามคิด

---

## เฉลย

ดู [`lab/solution/`](./src/lab/solution/) — ลองเองก่อนเพื่อผลลัพธ์การเรียนรู้สูงสุด
