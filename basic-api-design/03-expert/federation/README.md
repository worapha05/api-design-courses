# Federation Sample Subgraphs

ตัวอย่างแนวคิด **Apollo Federation** สำหรับ domain Bookstore/Orders ไฟล์เหล่านี้เป็น SDL
เชิงการศึกษา — แสดง `@key`, entity extension และการแบ่ง ownership

ใน production จะใช้ `@apollo/subgraph`, Schema Registry และ Router (เช่น Apollo Router)

## Topology

```
Router (supergraph)
 ├── users-subgraph owns User { id, name, email }
 ├── catalog-subgraph owns Book, extends User.authoredBooks
 └── orders-subgraph owns Order, extends User.orders
```

## รันจริง (ทางเลือกนอกคอร์ส)

ต้องมี Composition (Rover CLI / GraphOS) และ subgraph servers แยก port สำหรับคอร์สนี้ การอ่าน SDL +
LAB 3 เพียงพอต่อความเข้าใจสถาปัตยกรรม

ดูรายละเอียดในแต่ละไฟล์ `.graphql` คู่กัน
