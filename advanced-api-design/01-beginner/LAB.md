# Lab — Beginner: ออกแบบ REST + WebSocket จากสถานการณ์จริง

## สถานการณ์: FlashSale Shop

คุณเป็น API Engineer ของร้าน **FlashSale Shop** ที่กำลังเปิดตัวแอปมือถือ

**ปัญหาปัจจุบัน:**

1. Backend เดิมเป็น Level 0 — มีแค่ `POST /api` ส่ง `{ "action": "..." }` ทำให้ cache ไม่ได้ และ
   mobile team สับสน
2. หน้าสินค้าต้อง long-poll ทุก 3 วินาทีเพื่อดูสต็อก ทำให้แบตเตอรี่หมดเร็ว และ server CPU พุ่ง
3. เมื่อ user กดยกเลิกออเดอร์ที่ชำระเงินแล้ว ระบบคืน `200 OK` แต่ body เป็น `{ "ok": false }` ทำให้
   client ตีความผิด

---

## โจทย์

### ส่วนที่ 1 — ออกแบบ True RESTful Orders API (RMM Level 2+)

ออกแบบและ implement resource `/orders` ให้ครบ:

| Requirement     | รายละเอียด                                                           |
| --------------- | -------------------------------------------------------------------- |
| Methods         | GET list, GET by id, POST create, PATCH update status, DELETE cancel |
| Filtering       | `?status=` และ `?customerId=`                                        |
| Sorting         | `?sort=-createdAt,total`                                             |
| Pagination      | `page` + `limit` (max 50) พร้อม `meta`                               |
| Status codes    | ใช้ 201/204/404/409/422 ให้ถูกความหมาย                               |
| HATEOAS (โบนัส) | `_links` ตามสถานะ order                                              |

**Business rules:**

- สร้างออเดอร์ได้เฉพาะเมื่อ `total >= 0` และมี `customerId`
- ยกเลิกได้เฉพาะ `pending` → ถ้าไม่ใช่ให้ **409 Conflict**
- เปลี่ยนเป็น `shipped` ได้เฉพาะเมื่อสถานะปัจจุบันเป็น `paid` → ไม่เช่นนั้น **409**

### ส่วนที่ 2 — แทนที่ Polling ด้วย WebSocket

สร้าง endpoint `ws://.../ws/stock` ที่:

1. Client สมัครติดตามสินค้าด้วย `{ "type": "subscribe", "payload": { "productId": "p1" } }`
2. Server จำลองสต็อกเปลี่ยนทุก 2 วินาที แล้ว push
   `{ "type": "stock.updated", "payload": { "productId", "qty" } }`
3. รองรับ `ping` → `pong`
4. เมื่อ JSON ผิดหรือ type ไม่รู้จัก ให้ส่ง `error` ไม่ปิด connection

### ส่วนที่ 3 — วิเคราะห์และแก้ Anti-pattern

อธิบายสั้น ๆ (ใน comment หรือส่วนท้ายเฉลย) ว่าทำไมแต่ละข้อผิด และแก้ยังไง:

1. `GET /deleteOrder?id=1`
2. `POST /orders/123` เพื่ออ่านข้อมูล
3. คืน HTTP 200 ทุกครั้งแม้ validation fail
4. ไม่มี pagination บน `GET /orders` ที่อาจมีล้านแถว

---

## เกณฑ์ผ่าน

- [ ] URI เป็น nouns / ใช้ HTTP methods ถูกต้อง
- [ ] Status codes สะท้อนผลลัพธ์จริง (ไม่ซ่อน error ใน 200)
- [ ] List endpoint มี filter + sort + pagination
- [ ] WebSocket push สต็อกได้โดยไม่ต้อง poll
- [ ] Message มี `type` ชัดเจน และจัดการ error ต่อ message ได้

---

## เฉลย

### เฉลยส่วนที่ 1 — TypeScript (ครบถ้วน)

ดู implementation อ้างอิงใน [`src/rest/typescript/server.ts`](./src/rest/typescript/server.ts) —
สรุปจุดสำคัญ:

```typescript
// DELETE → 409 เมื่อไม่ใช่ pending
app.delete('/orders/:id', (req, res) => {
  const existing = orders.get(req.params.id);
  if (!existing) return problem(res, 404, 'Not Found', `Order ${req.params.id} not found`);
  if (existing.status !== 'pending') {
    return problem(res, 409, 'Conflict', 'only pending orders can be cancelled');
  }
  existing.status = 'cancelled';
  orders.set(existing.id, existing);
  return res.status(204).send();
});

// PATCH shipped → ต้อง paid ก่อน
if (body.status === 'shipped' && existing.status !== 'paid' && existing.status !== 'shipped') {
  return problem(res, 409, 'Conflict', 'order must be paid before shipping');
}
```

**ทดสอบด้วย curl:**

```bash
# List + filter + sort + page
curl "http://localhost:3000/orders?status=pending&sort=-total&page=1&limit=10"

# Create → 201 + Location
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cus_z","total":99}'

# Cancel pending → 204
curl -i -X DELETE http://localhost:3000/orders/ord_1

# Cancel paid → 409
curl -i -X DELETE http://localhost:3000/orders/ord_2
```

Go / Python เทียบเท่า: [`src/rest/go/main.go`](./src/rest/go/main.go),
[`src/rest/python/server.py`](./src/rest/python/server.py)

---

### เฉลยส่วนที่ 2 — WebSocket Stock Feed (TypeScript)

สร้างไฟล์ `lab/stock-server.ts` (หรือขยายจากตัวอย่าง beginner):

```typescript
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = 3002;
const stock = new Map<string, number>([
  ['p1', 50],
  ['p2', 10],
  ['p3', 0],
]);

/** productId → set of sockets */
const subs = new Map<string, Set<WebSocket>>();

const httpServer = createServer((_req, res) => {
  res.end('ws://localhost:3002/ws/stock\n');
});
const wss = new WebSocketServer({ server: httpServer, path: '/ws/stock' });

function send(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, id: randomUUID(), timestamp: new Date().toISOString(), payload }));
}

function subscribe(ws: WebSocket, productId: string) {
  if (!subs.has(productId)) subs.set(productId, new Set());
  subs.get(productId)!.add(ws);
  send(ws, 'subscribed', { productId, qty: stock.get(productId) ?? null });
}

function unsubscribeAll(ws: WebSocket) {
  for (const set of subs.values()) set.delete(ws);
}

wss.on('connection', (ws) => {
  send(ws, 'welcome', { products: [...stock.keys()] });

  ws.on('message', (raw) => {
    let msg: { type?: string; payload?: { productId?: string } };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, 'error', { message: 'invalid JSON' });
      return;
    }
    switch (msg.type) {
      case 'ping':
        send(ws, 'pong', msg.payload);
        break;
      case 'subscribe': {
        const id = msg.payload?.productId;
        if (!id || !stock.has(id)) {
          send(ws, 'error', { message: 'unknown productId' });
          break;
        }
        subscribe(ws, id);
        break;
      }
      case 'unsubscribe': {
        const id = msg.payload?.productId;
        if (id) subs.get(id)?.delete(ws);
        send(ws, 'unsubscribed', { productId: id });
        break;
      }
      default:
        send(ws, 'error', { message: `unknown type: ${msg.type}` });
    }
  });

  ws.on('close', () => unsubscribeAll(ws));
});

// จำลองสต็อกเปลี่ยนทุก 2 วินาที — แทนที่ long-polling
setInterval(() => {
  for (const [productId, qty] of stock) {
    const next = Math.max(0, qty + (Math.random() > 0.5 ? -1 : 1));
    stock.set(productId, next);
    const watchers = subs.get(productId);
    if (!watchers) continue;
    for (const ws of watchers) {
      send(ws, 'stock.updated', { productId, qty: next });
    }
  }
}, 2000);

httpServer.listen(PORT, () => console.log(`Stock WS on ws://localhost:${PORT}/ws/stock`));
```

**Client ทดสอบ:**

```typescript
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3002/ws/stock');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', payload: { productId: 'p1' } }));
});
ws.on('message', (d) => console.log(String(d)));
```

**ทำไมดีกว่า polling:** server ส่งเฉพาะเมื่อมีผู้ subscribe และเมื่อค่าเปลี่ยน — ลด request
ที่ไม่มีประโยชน์ และ latency ต่ำกว่า

---

### เฉลยส่วนที่ 3 — Anti-patterns

| Anti-pattern                 | ทำไมผิด                                   | แก้                                   |
| ---------------------------- | ----------------------------------------- | ------------------------------------- |
| `GET /deleteOrder?id=1`      | GET ต้อง safe/idempotent; verb อยู่ใน URI | `DELETE /orders/1`                    |
| `POST /orders/123` เพื่ออ่าน | POST ไม่ safe; cache/proxy ใช้ไม่ได้      | `GET /orders/123`                     |
| HTTP 200 + `{ ok: false }`   | client/tooling อ่าน status ไม่ได้ความหมาย | ใช้ 4xx/5xx + Problem Details         |
| ไม่มี pagination             | OOM, timeout, DoS ง่าย                    | บังคับ `limit` สูงสุด + cursor/offset |

---

## สิ่งที่ควรได้หลัง Lab นี้

1. แยกได้ว่า API ของคุณอยู่ Richardson Level ไหน
2. เลือก status code ได้โดยไม่ต้องเดา
3. อธิบายได้ว่า WebSocket ชนะ polling ตรงไหน และเมื่อไหร่ควรใช้ SSE แทน

**ถัดไป:** [`../02-intermediate/README.md`](../02-intermediate/README.md)
