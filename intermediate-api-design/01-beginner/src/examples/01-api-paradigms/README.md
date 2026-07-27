# 01 — API Paradigms Comparison

เปรียบเทียบแนวคิด REST / GraphQL / gRPC แบบไม่ต้องสตาร์ท server

```bash
node 01-beginner/examples/01-api-paradigms/compare.js
```

สังเกต:

- REST มักใช้หลาย round-trip และได้ field เกิน
- GraphQL รวมความต้องการใน query เดียว
- gRPC เน้น procedure + typed message (จำลองด้วย object)
