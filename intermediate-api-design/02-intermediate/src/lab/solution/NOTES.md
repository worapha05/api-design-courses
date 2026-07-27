# คำตอบคำถามคิด — PulseBoard Intermediate Lab

## 1. ทำไม DataLoader ต้องสร้างใหม่ทุก request?

DataLoader มี **cache ต่อ instance** ถ้าใช้ตัวเดียวข้าม request ผู้ใช้ A อาจได้ข้อมูลที่ cache
จากผู้ใช้ B (ข้อมูลรั่ว / ข้อมูลเก่าผิดสิทธิ์) สร้างใหม่ใน `context` ทุก request = batch ภายใน
request เดียว แต่ไม่ cache ข้ามผู้ใช้

## 2. หลาย GraphQL instance กับ PubSub in-memory

Event ที่ publish บน instance A จะไม่ถึง subscriber ที่ต่ออยู่ instance B แก้ด้วย **Redis PubSub**,
NATS, หรือ message bus อื่นเป็น shared broker ระหว่าง process

## 3. เมื่อไหร่ใช้ gRPC-Web ตรง ๆ แทน GraphQL Subscription?

- UI ต้องการ binary/typed stream ความถี่สูงจากบริการเดียว
- ไม่ต้องการ graph composition / field selection ของ GraphQL
- ทีมพร้อมดูแล Envoy + codegen ฝั่ง frontend

ถ้า UI รวมหลาย bounded context และต้องการ query ยืดหยุ่น — GraphQL Subscription (หรือ BFF ที่
aggregate stream) มักดูแลง่ายกว่าในระยะยาว
