# Lab ระดับ Intermediate — แดชบอร์ดสด “PulseBoard”

## เป้าหมาย

สร้างระบบ **Data Aggregation + Real-time Updates** สำหรับแดชบอร์ดปฏิบัติการ:

- GraphQL ดึง `Device` พร้อม `metrics` โดยใช้ **DataLoader** กัน N+1
- gRPC **Server Streaming** ส่ง metric สดจากอุปกรณ์
- GraphQL **Subscription** กระจาย update ไปยัง UI เมื่อมี metric ใหม่

ทำด้วยตัวเองก่อน แล้วค่อยเทียบกับ [`lab/solution/`](./src/lab/solution/)

---

## กรณีศึกษา

บริษัท IoT **PulseBoard** มีอุปกรณ์หลายพันเครื่อง หน้าแดชบอร์ดต้องแสดงรายการ device + metric ล่าสุด
และ update สดเมื่อค่าเปลี่ยน

ปัญหาปัจจุบัน:

1. REST เรียก `/devices` แล้ววน `/devices/:id/metrics` → N+1 ช้ามาก
2. Polling ทุก 2 วินาที ทำให้ API ร้อน
3. ทีม telemetry มี gRPC stream อยู่แล้ว แต่ frontend ยังไม่ได้ใช้

CTO ต้องการ prototype ที่:

1. GraphQL `devices { id name latestMetric { cpu } }` ใช้ DataLoader
2. มี worker อ่าน gRPC `WatchMetrics` แล้ว `pubsub.publish`
3. Frontend สมัคร `metricUpdated(deviceId: ...)`

---

## โจทย์

### ส่วนที่ 1 — Schema & DataLoader

```graphql
type Device {
  id: ID!
  name: String!
  latestMetric: Metric
}

type Metric {
  deviceId: ID!
  cpu: Float!
  memory: Float!
  ts: String!
}

type Query {
  devices: [Device!]!
  device(id: ID!): Device
}

type Mutation {
  """
  จำลองการ push metric (ใช้ตอนทดสอบโดยไม่เปิด gRPCก็ได้)
  """
  pushMetric(deviceId: ID!, cpu: Float!, memory: Float!): Metric!
}

type Subscription {
  metricUpdated(deviceId: ID!): Metric!
}
```

ข้อกำหนด:

1. Seed devices อย่างน้อย 5 เครื่อง
2. `latestMetric` โหลดผ่าน DataLoader ที่ batch ตาม deviceIds
3. นับจำนวน DB/store calls ต่อ request ได้ (log หรือ field `debugDbCalls`)

### ส่วนที่ 2 — gRPC Server Streaming

ใช้ proto ประมาณ:

```protobuf
service PulseTelemetry {
 rpc WatchMetrics(WatchRequest) returns (stream Metric);
}
```

ข้อกำหนด:

1. Stream ส่ง metric ของ `device_id` ทุก ~300–500ms อย่างน้อย N จุด
2. มี bridge process/function ที่อ่าน stream แล้วเรียก `pushMetric` / pubsub

### ส่วนที่ 3 — Real-time Subscription

1. เมื่อมี metric ใหม่ต้อง publish เข้า subscription
2. Filter ตาม `deviceId`
3. ทดสอบ: subscribe เครื่องหนึ่ง → push/stream → ได้ event

### ส่วนที่ 4 — คำถามคิด (`NOTES.md`)

1. ทำไม DataLoader ต้องสร้างใหม่ทุก request?
2. ถ้ามี GraphQL server หลาย instance — PubSub in-memory มีปัญหาอะไร และแก้ด้วยอะไร?
3. เมื่อไหร่ควรให้ browser ใช้ gRPC-Web ตรง ๆ แทน GraphQL Subscription?

---

## เกณฑ์ผ่าน

- [ ] Query devices ไม่เกิด N+1 (batch ชัดเจน)
- [ ] gRPC server streaming ทำงาน
- [ ] Subscription รับ metric แบบ real-time
- [ ] มี NOTES.md

---

## เฉลย

ดู [`lab/solution/`](./src/lab/solution/)
