# Lab — Expert: Checkout Saga ล่ม + Real-time Scale + Zero-Downtime Secure Edge

## สถานการณ์: MegaMart Flash Checkout

คืน Flash Sale ของ **MegaMart** มี traffic พุ่ง 20 เท่า

**เหตุการณ์จริงที่จำลอง:**

1. Order service สร้างออเดอร์แล้วเรียก Payment สำเร็จ แต่ Inventory ล่มกลางทาง — เงินถูกหัก
   ของไม่จอง ลูกค้าโวยวาย
2. WebSocket notification node รับ 50k connections แล้ว OOM / FD exhausted — reconnect ทุก client
   พร้อมกันทำ thundering herd
3. ทีม security พบว่า internal service รับ JWT จาก internet โดยตรงได้ (ไม่มี mTLS) และมีคนเรียก
   payment ซ้ำตอน dependency ช้าจนวงจรล้มทั้งระบบ
4. Deploy version ใหม่ตอน peak ทำให้ WS connections ถูกตัดพร้อมกันทั้งหมด — canary ไม่มี draining

คุณคือ Principal Engineer ที่ต้องออกแบบชุดแก้ให้จบเป็นระบบ

---

## โจทย์

### ส่วนที่ 1 — Saga สำหรับ Place Order

ออกแบบ orchestration saga:

```
ReservePayment → ReserveStock → CapturePayment → Notify
```

เงื่อนไข:

- ถ้า `ReserveStock` ล้ม → compensate `CancelPayment`
- ทุกขั้นต้อง **idempotent** ได้ conceptually (มี id อ้างอิง)
- แสดง log ลำดับ execute / compensate ให้ตรวจได้

โบนัส: อธิบายว่า CDC จากตาราง `orders` ช่วย push `order.shipped` เข้า WS room ได้อย่างไรโดยไม่ให้
Order เรียก Notifier ตรง ๆ

### ส่วนที่ 2 — WebSocket at Scale

1. Server มี bounded queue / ตรวจ `bufferedAmount` แล้ว drop หรือ kick เมื่อเกิน threshold
2. Client reconnect ด้วย **exponential backoff + jitter**
3. รองรับ **drain** ตอน SIGTERM (ไม่รับ conn ใหม่ + ปิดอย่างสุภาพ)
4. ระบุค่า `ulimit -n` ที่จะตั้งใน production notes

### ส่วนที่ 3 — Security & Resilience ที่ขอบ

1. Gateway ตรวจ JWT (`iss`/`aud`/`exp`/signature) แล้วค่อยเข้าถึง API
2. อธิบายแผน mTLS ระหว่าง Gateway ↔ Services (ไม่ต้องออก cert จริงก็ได้ แต่ต้องถูกต้องตามหลัก)
3. หุ้ม Payment client ด้วย Circuit Breaker — fail fast เมื่อ open

### ส่วนที่ 4 — Blue-Green / Canary Runbook

เขียน runbook สั้น ๆ (10–15 บรรทัด) สำหรับ deploy WS node แบบ zero-downtime:

- canary %
- drain
- rollback criteria

---

## เกณฑ์ผ่าน

- [ ] Saga ล้มแล้ว compensate ถูกต้อง ไม่ค้างเงิน
- [ ] Client ไม่ reconnect แบบคงที่ทุก 1s พร้อมกันทั้งฝูง
- [ ] SIGTERM ไม่รับ connection ใหม่
- [ ] JWT ปลอม/หมดอายุได้ 401
- [ ] Circuit open แล้วไม่ยิง dependency ต่อเนื่อง
- [ ] มี runbook deploy ที่ทีมอื่นทำตามได้

---

## เฉลย

### เฉลยส่วนที่ 1 — Saga Orchestrator

โค้ดเต็ม: [`src/saga/typescript/orchestrator.ts`](./src/saga/typescript/orchestrator.ts)

```bash
cd src/saga/typescript && npm install && npx tsx orchestrator.ts
```

ผลลัพธ์ที่คาดหวัง (ย่อ):

```
=== Saga ... order=ord_ok ===
→ ReservePayment
→ ReserveStock
→ CapturePayment
→ Notify
✓ Saga completed

=== Saga ... order=ord_fail_stock ===
→ ReservePayment
→ ReserveStock
✗ ReserveStock failed: insufficient stock
 [compensate] CancelPayment pay_...
```

Go: [`src/saga/go/saga.go`](./src/saga/go/saga.go)

**CDC โบนัส — ดู** [`src/resilience/cdc-notifier.ts`](./src/resilience/cdc-notifier.ts):

```
Orders DB WAL → CDC connector → topic order.events
 → Notifier service (inbox dedupe by eventId)
 → Redis/WS hub room:order:{id} push { type: "order.shipped" }
```

Order service **ไม่ต้องรู้** ว่ามี WebSocket หรือไม่ — ลด coupling และทนต่อ Notifier downtime (event
ค้างใน log/topic)

---

### เฉลยส่วนที่ 2 — Scale + Backoff + Drain

Server: [`src/websocket-scale/typescript/server.ts`](./src/websocket-scale/typescript/server.ts)
Client:
[`src/websocket-scale/typescript/client-reconnect.ts`](./src/websocket-scale/typescript/client-reconnect.ts)

```bash
cd src/websocket-scale/typescript && npm install
npx tsx server.ts
# อีก terminal
npx tsx client-reconnect.ts
# ทดสอบ drain
kill -TERM <pid>
```

Backpressure หลัก:

```typescript
if (ws.bufferedAmount > MAX_BUFFERED) {
  metrics.dropped++;
  ws.close(1008, 'backpressure');
}
```

Backoff หลัก:

```typescript
const exp = Math.min(CAP_MS, BASE_MS * 2 ** attempt);
const jitter = Math.random() * exp * 0.2;
return exp + jitter;
```

**Production notes (FD):**

```
# container / systemd
LimitNOFILE=1048576
# ตรวจ
cat /proc/$(pgrep -f server)/limits | grep 'open files'
```

ประมาณการคร่าว ๆ: 50k WS ≈ ≥50k FD + Redis + extras → ตั้ง headroom 2–4 เท่า

Go ทางเลือก: [`src/websocket-scale/go/server.go`](./src/websocket-scale/go/server.go)

---

### เฉลยส่วนที่ 3 — JWT + mTLS + Circuit Breaker

**JWT Gateway:**

```bash
cd src/security/typescript && npm install && npx tsx gateway-jwt.ts
curl -s http://localhost:8088/.well-known/demo-token | jq -r .token > /tmp/t
curl -i -H "Authorization: Bearer $(cat /tmp/t)" http://localhost:8088/v1/secure-orders
curl -i -H "Authorization: Bearer eyJhbGciOiJub25lIn0.bad.sig" http://localhost:8088/v1/secure-orders
```

โค้ด: [`src/security/typescript/gateway-jwt.ts`](./src/security/typescript/gateway-jwt.ts)

**mTLS แผน:**

ดู [`src/security/go/mtls-notes.md`](./src/security/go/mtls-notes.md)

```
Internet --TLS+JWT--> Gateway --mTLS--> Order/Payment/Inventory
User identity: X-User-Id / X-Scope จาก gateway หลัง verify JWT
Service identity: client certificate SAN / SPIFFE ID
```

**Circuit Breaker:**

```bash
cd src/resilience && npm install && npx tsx circuit-breaker.ts
```

เมื่อ state = `open` การเรียกจะ throw `circuit_open:payment` ทันที — หยุดการถล่ม Payment
และเปิดโอกาสให้ระบบ degrade (เช่น คิวออเดอร์รอชำระภายหลัง)

---

### เฉลยส่วนที่ 4 — Canary / Blue-Green Runbook (ตัวอย่าง)

```
1. Deploy canary WS nodes (10% traffic) ด้วย label version=canary
2. Gateway / LB แบ่ง hash(userId) % 100 < 10 → canary
3. เฝ้า 15 นาที: error rate, p99 send latency, FD usage, reconnect storm
4. ถ้าผิดปกติ → weight canary = 0 (rollback ทันที) ไม่ต้อง redeploy blue
5. ถ้าปกติ → ขยาย 50% → 100%
6. ตอนถอน blue: ส่ง SIGTERM → accepting=false → close(1001)
7. Client reconnect ด้วย backoff ไปยัง green; sticky cookie หมดอายุตาม policy
8. DB/API contract ต้อง backward compatible ก่อนตัด traffic ทั้งหมด
9. เก็บ rollback criteria ไว้ใน dashboard: 5xx > 1% หรือ WS drop rate > 2%
10. Post-deploy: ตรวจ CDC lag และ saga compensation metrics
```

---

## สรุปทักษะหลังจบ Bootcamp

| ระดับ        | คุณพิสูจน์แล้วว่า                                                |
| ------------ | ---------------------------------------------------------------- |
| Beginner     | ออกแบบ REST ระดับ RMM 2–3 และ WS พื้นฐานแทน polling              |
| Intermediate | Scale WS ด้วย Redis, ตั้ง Gateway, จัดการ CORS/versioning        |
| Expert       | Saga/CDC, backpressure, JWT+mTLS, Circuit Breaker, zero-downtime |

กลับไปทบทวน: [`../README.md`](../README.md)
