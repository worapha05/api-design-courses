# AetherEdge — NOTES

## Trace propagation

Gateway สร้างหรือรับ `x-trace-id` แล้วใส่ใน:

1. HTTP response header กลับไปหา partner
2. gRPC Metadata ไปหา Inventory

ทำให้ log สองฝั่งจับคู่ request เดียวกันได้ — ในระบบจริงใช้ W3C `traceparent` ผ่าน OpenTelemetry

## ทำไมต้อง reuse gRPC stub

สร้าง `new Inventory(...)` ทุก HTTP request = handshake TCP/TLS/HTTP/2 ซ้ำ → latency พุ่ง
และเสียประโยชน์ multiplexing สร้าง stub ระดับ module/process หนึ่งตัว แล้วเรียกซ้ำ = connection
เดิมรองรับหลาย RPC พร้อมกัน

## ตัวอย่าง query ที่ถูกบล็อก

Depth > 5 (ถ้ามี nested type ลึก) หรือ cost สูงเกิน budget (`MAX_COST = 40`) สูตรในเฉลยให้
`item`/`reserve` ราคา 5 หน่วยต่อ field — ปรับตาม domain จริง

ตัวอย่างที่ควรถูก reject เมื่อคุณเพิ่ม field list แพง ๆ:

```graphql
{
 item(sku: "sku-1") {
 # สมมติมี related { related { related { ... } } } ลึกเกิน 5
 }
}
```

## mTLS

รัน `generate-certs.sh` ก่อนสตาร์ท server/gateway Server ตรวจ client cert; client ตรวจ server cert →
บริการปลอมที่ไม่มี cert ใน trust chain เชื่อมไม่ได้

## Federation ใน lab นี้

Gateway ทำหน้าที่เป็น **edge composer** ระหว่าง public GraphQL/REST กับ internal gRPC ในระบบใหญ่
อาจมี Apollo Router รวม subgraphs หลายทีม แล้ว gateway ชั้นนอกค่อยใส่ auth / mTLS / rate limit
