# Lab — Intermediate: Real-time ล่ม + API Gateway ในระบบ Microservices

## สถานการณ์: LiveOps Control Center

บริษัทเกม **NovaQuest** มีแดชบอร์ด LiveOps ที่เปิด WebSocket ค้างไว้ทั้งวัน

**อาการที่เกิดขึ้นใน production:**

1. หลัง deploy ใหม่ ข้อความจากทีม A (เชื่อม Node 1) ไม่ถึงทีม B (เชื่อม Node 2) — chat
   "หายครึ่งหนึ่ง"
2. Memory ของ WS node โตเรื่อย ๆ แม้จำนวน user ในแดชบอร์ดลดลง — สงสัย zombie connections
3. Mobile app เรียก Order service โดยตรงที่ internal URL ได้ ทำให้มีคนยิง flood จน service ล่ม
4. Partner บ่นว่า CORS error ทั้งที่ API key ถูกต้อง และมีคนตั้ง `Access-Control-Allow-Origin: *`
   คู่ credentials

คุณต้องออกแบบและ implement ชุดแก้ปัญหา

---

## โจทย์

### ส่วนที่ 1 — ซ่อม Real-time Hub

Implement WebSocket hub ที่:

| Requirement | รายละเอียด                                        |
| ----------- | ------------------------------------------------- |
| Heartbeat   | protocol ping ทุก 30s; ไม่มี pong → terminate     |
| Rooms       | `join` / `leave` / `chat` เฉพาะห้องที่ join แล้ว  |
| Multi-node  | Redis Pub/Sub adapter — ข้อความข้าม node ได้      |
| Anti-echo   | node ที่ publish ไม่ประมวลผล message ของตัวเองซ้ำ |

**ทดสอบ:** รัน 2 instances คนละ port แล้ว join room เดียวกันจาก 2 clients

### ส่วนที่ 2 — API Gateway กันพายุ

สร้าง Gateway ที่:

1. External path: `GET /v1/orders` → Upstream `/orders`
2. บังคับ Bearer token (demo ได้)
3. Rate limit แบบ Token Bucket ต่อ user
4. แปลง `Authorization` → `X-User-Id` และใส่ `X-Request-Id`
5. **ห้าม** forward Authorization ดิบไป upstream

### ส่วนที่ 3 — Versioning + CORS

1. รองรับอย่างน้อย 2 versions ของ products API (URL หรือ Header)
2. CORS whitelist เฉพาะ `https://ops.novaquest.com` และ `http://localhost:5173`
3. อธิบายว่าทำไม `Allow-Origin: *` + credentials จึงผิด

### ส่วนที่ 4 — Postmortem สั้น ๆ

เขียน 5–8 บรรทัด: root cause ของอาการ #1 และ #2 ด้านบน และทำไม Redis adapter + heartbeat แก้ได้

---

## เกณฑ์ผ่าน

- [ ] 2 nodes ส่งข้อความหากันผ่าน Redis ได้
- [ ] Dead connection ถูกตัดภายใน ~60s หลังเงียบ
- [ ] ยิงเกิน rate limit ได้ 429 + Retry-After
- [ ] Upstream ไม่เห็น Authorization header
- [ ] CORS ไม่สะท้อน origin แปลกปลอม

---

## เฉลย

### เฉลยส่วนที่ 1 — Heartbeat + Rooms + Redis

ดูโค้ดเต็ม: [`src/websocket/typescript/server.ts`](./src/websocket/typescript/server.ts)

จุดสำคัญ:

```typescript
// Heartbeat
ws.on('pong', () => {
  ws.isAlive = true;
});
setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30_000);

// Redis anti-echo
sub.on('message', (_ch, raw) => {
  const bus = JSON.parse(raw);
  if (bus.origin === INSTANCE_ID) return;
  localBroadcast(bus.room, bus.envelope);
});
```

**วิธีรันทดสอบ 2 nodes:**

```bash
docker run -d --name bootcamp-redis -p 6379:6379 redis:7-alpine
cd src/websocket/typescript && npm install

INSTANCE_ID=n1 PORT=4001 npx tsx server.ts &
INSTANCE_ID=n2 PORT=4002 npx tsx server.ts &
```

Client A → `ws://localhost:4001/ws` join `ops` Client B → `ws://localhost:4002/ws` join `ops` ส่ง
chat จาก A → B ต้องได้รับ (มี `"via":"n1"`)

Go ทางเลือก (heartbeat + rooms ใน process เดียว):
[`src/websocket/go/main.go`](./src/websocket/go/main.go)

---

### เฉลยส่วนที่ 2 — Gateway

โค้ดเต็ม: [`src/gateway/typescript/gateway.ts`](./src/gateway/typescript/gateway.ts) +
[`upstream.ts`](./src/gateway/typescript/upstream.ts)

```bash
cd src/gateway/typescript && npm install
npx tsx upstream.ts &
npx tsx gateway.ts
```

```bash
TOKEN=$(echo -n 'user:alice' | base64)
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:8080/v1/orders

# Flood → 429
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
    http://localhost:8080/v1/orders
done
```

เทียบ Go / Python: `src/gateway/go/`, `src/gateway/python/`

**ทำไมห้าม forward Authorization:** internal service ไม่ควรรู้ external token format;
ลดพื้นที่โจมตีถ้า internal ถูก compromise; บังคับให้ identity เป็น first-class header ที่ audit ได้

---

### เฉลยส่วนที่ 3 — CORS + Versioning

ดู [`src/security/cors-versioning.ts`](./src/security/cors-versioning.ts)

```typescript
const ALLOWED_ORIGINS = new Set(['https://ops.novaquest.com', 'http://localhost:5173']);

if (origin && ALLOWED_ORIGINS.has(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}
```

**ทำไม `*` + credentials ผิด:** สเปก CORS ห้าม และถ้า browser/lib ยอม จะเท่ากับอนุญาตทุกเว็บอ่าน
response พร้อมคุกกี้ — เปิดทาง CSRF-like data theft

Versioning แนะนำสำหรับ NovaQuest: **URL `/v1` `/v2`** สำหรับ partner ที่ชัดเจน + ส่ง `Deprecation` /
`Sunset` เมื่อเลิกใช้ v1

---

### เฉลยส่วนที่ 4 — Postmortem

```
Root cause #1: WebSocket connections เป็น process-local state
เมื่อ LiveOps ถูก load-balance ไปคนละ node โดยไม่มี shared pub/sub
broadcast ใน Node 1 จึงไม่ถึง clients บน Node 2

Root cause #2: ไม่มี heartbeat/pong timeout ทำให้ half-open TCP
จาก laptop sleep / NAT idle ยังค้างใน memory และ rooms map

Fix: Redis adapter กระจายข้อความข้าม nodes + sticky session เป็น
optimization ไม่ใช่ที่พึ่งเดียว; heartbeat terminate zombie ภายใน 1–2 รอบ ping
```

---

## Checklist ก่อนขึ้น Expert

- [ ] อธิบายได้ว่า sticky session อย่างเดียวไม่พอเมื่อ node restart
- [ ] แยก external path กับ internal path ในหัวได้อย่างชัด
- [ ] เลือก versioning strategy พร้อมเหตุผล deprecate

**ถัดไป:** [`../03-expert/README.md`](../03-expert/README.md)
