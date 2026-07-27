# คำตอบคำถามคิด — NovaShelf Beginner Lab

## 1. ทำไม frontend ถึงเหมาะกับ GraphQL มากกว่าเรียก gRPC โดยตรง?

Browser ไม่พูด gRPC native (ต้องใช้ gRPC-Web + proxy) และ UI มักต้องการข้อมูลหลาย entity
ในรูปทรงที่เปลี่ยนตามหน้าจอ GraphQL ให้ field selection, tooling (GraphiQL), และทำงานบน HTTP/JSON
ที่ frontend คุ้นเคย gRPC เหมาะกว่าเป็น internal RPC ระหว่างบริการคลัง / สต็อก / billing

## 2. ถ้าเพิ่ม field `isbn` ใน GraphQL แต่ยังไม่ใส่ใน proto — มีปัญหาอะไรหรือไม่?

ไม่เป็นปัญหาโดยตรง เพราะเป็นคนละ contract คนละ consumer GraphQL BFF อาจเก็บ `isbn` จาก DB/store
ของตัวเองโดยที่ InventoryService ไม่ต้องรู้ ปัญหาเกิดเมื่อ _สมมติว่า_
สองระบบเป็นแหล่งความจริงเดียวกันโดยไม่ sync schema — ควรมี bounded context ชัดเจนว่า field
ไหนเป็นของบริการไหน

## 3. การ reuse field number ใน Protobuf อันตรายอย่างไร?

Field number คือ identity ใน binary wire format ถ้า reuse หมายเลขเก่าให้ความหมายใหม่ Client/Server
คนละ version จะถอดรหัสผิดเงียบ ๆ (ข้อมูลเพี้ยน) โดยไม่จำเป็นต้อง error ชัดเจน ดังนั้น field
ที่เลิกใช้ควร `reserved` ห้ามนำหมายเลขกลับมาใช้

---

## วิธีรันเฉลยที่ถูกต้อง (shared store)

```bash
node combined-server.js
# terminal อื่น
node demo.js
```

`graphql-server.js` + `grpc-server.js` แยก process มีไว้ศึกษาโครงสร้าง แต่ memory ไม่แชร์กัน — ใช้
`combined-server.js` เพื่อผ่านเกณฑ์ส่วน shared store
