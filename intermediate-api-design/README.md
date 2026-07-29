📍 **Nav:** [`🏠 Dev Learning Courses Hub`](https://github.com/worapha05/dev-learning-courses-hub/blob/main/README.md) | [`📂 API Design Courses Index`](../README.md) | [`📝 Prompt File`](https://github.com/worapha05/ai-learning-prompts-hub/blob/main/course-generation/api-design-courses/intermediate-api-design-prompt.md)

---

# Advanced API Designs and Communication Bootcamp — Zero to Expert

bootcamp เรียนรู้ **Advanced API Designs และ Communication Protocols** แบบครบวงจร เน้น **GraphQL และ
gRPC** — จาก Schema Foundations → Streaming / Real-time → Federation / Security / Gateway

---

## เป้าหมายของหลักสูตร

เมื่อจบหลักสูตรนี้ คุณจะสามารถ:

- อธิบายความต่างของ **REST / GraphQL / gRPC** และเลือกโปรโตคอลให้เหมาะกับงาน
- ออกแบบ **GraphQL Schema (SDL)** พร้อม Queries, Mutations และ Object Types
- นิยาม **Protocol Buffers (proto3)** สร้าง Messages / Services และ Unary RPC
- แก้ปัญหา **N+1** ด้วย DataLoader และใช้ **gRPC Streaming** ทั้ง 3 แบบ
- ตั้งค่า **GraphQL Subscriptions** และ **gRPC-Web** สำหรับ frontend
- ออกแบบ **Federation / Subgraphs**, จำกัด Query Cost, และสร้าง **API Gateway** ที่แปลง REST/GraphQL
  → gRPC พร้อม **OpenTelemetry** และ **mTLS**

---

## โครงสร้างหลักสูตร

| Level            | folder                                   | หัวข้อหลัก                                                   | เวลาแนะนำ   |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------ | ----------- |
| 1 — Beginner     | [`01-beginner/`](./01-beginner/)         | API paradigms, GraphQL SDL, gRPC Unary                       | 1–2 สัปดาห์ |
| 2 — Intermediate | [`02-intermediate/`](./02-intermediate/) | Resolvers/DataLoader, Streaming, Subscriptions, gRPC-Web     | 2–3 สัปดาห์ |
| 3 — Expert       | [`03-expert/`](./03-expert/)             | Federation, Query Cost, HTTP/2 tuning, Gateway + OTel + mTLS | 2–4 สัปดาห์ |

แต่ละระดับประกอบด้วย:

1. **`README.md`** — ทฤษฎีเชิงลึกภาษาไทย เน้นการออกแบบโปรโตคอลและการเปรียบเทียบ Trade-offs
2. **`src/examples/`** — โค้ด TypeScript/JavaScript (Node.js) + `.proto` / SDL ที่รันได้จริง
3. **`LAB.md`** — โจทย์กรณีศึกษาจริงพร้อมเฉลยเต็มใน `src/lab/solution/`

---

## ข้อกำหนดเบื้องต้น

- ความรู้พื้นฐาน JavaScript/TypeScript (ES modules, async/await)
- ความเข้าใจ HTTP / JSON และแนวคิด client–server
- ติดตั้ง [Node.js 20+](https://nodejs.org/) และ [Docker](https://www.docker.com/) (สำหรับ Envoy /
  demo gateway)

```bash
node -v # ควรเป็น v20.x ขึ้นไป
docker --version
docker compose version
```

---

## วิธีใช้ Bootcamp

1. ติดตั้ง dependencies จาก root ของ bootcamp
2. (ถ้าต้องการ gRPC-Web / Envoy) สตาร์ท Docker Compose
3. อ่าน `README.md` ของระดับนั้นให้จบ — โฟกัสที่ **ทำไมออกแบบ API แบบนี้**
4. รันตัวอย่างใน `src/examples/` ตามลำดับ (ก่อนรันให้ `cd src && npm install` ในระดับนั้นก่อน)
5. ทำ Lab ใน `LAB.md` **ด้วยตัวเองก่อน** แล้วค่อยดูเฉลย
6. ไประดับถัดไปเมื่ออธิบาย trade-off ของโปรโตคอลได้

```bash
cd intermediate-api-design/01-beginner/src
npm install

# Beginner — GraphQL server
node 01-beginner/src/examples/03-graphql-server/server.js

# Beginner — gRPC unary
node 01-beginner/src/examples/04-grpc-unary/server.js
# terminal อีกอัน
node 01-beginner/src/examples/04-grpc-unary/client.js
```

| บริการ                         | Host Port | Notes                 |
| ------------------------------ | --------- | --------------------- |
| GraphQL (ตัวอย่าง beginner)    | `4400`    | http://localhost:4400 |
| GraphQL DataLoader demo        | `4401`    | http://localhost:4401 |
| gRPC unary (ตัวอย่าง beginner) | `50051`   | plaintext             |
| GraphQL subscriptions          | `4001`    | WS + HTTP             |
| Envoy gRPC-Web proxy           | `8080`    | แปลง gRPC-Web → gRPC  |
| Gateway (expert lab)           | `8088`    | REST/GraphQL → gRPC   |

---

## Learning Path ที่แนะนำ

```
Beginner: REST vs GraphQL vs gRPC + SDL + Proto3 Unary
 ↓
Intermediate: Resolvers/DataLoader + Streaming + Subscriptions + gRPC-Web
 ↓
Expert: Federation + Query Cost/DoS + HTTP/2 Tuning + Gateway/OTel/mTLS
 ↓
project จริงของคุณเอง (BFF GraphQL / Microservice Mesh / Real-time Dashboard)
```

---

## เมื่อไหร่ใช้ GraphQL vs gRPC vs REST?

| คำถาม                                                             | แนวทาง                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Frontend ต้องการดึงข้อมูลยืดหยุ่น ลด over/under-fetching?         | GraphQL                                                                       |
| Service-to-service ภายใน mesh ต้องการ latency ต่ำ + contract ชัด? | gRPC                                                                          |
| Public API ง่าย ๆ, caching HTTP ดี, ทีมคุ้นเคย?                   | REST                                                                          |
| Real-time ไปยัง browser?                                          | GraphQL Subscriptions หรือ SSE/WebSocket; gRPC-Web ถ้าต้องการ typed streaming |
| Mobile/Bandwidth จำกัด + binary payload?                          | gRPC (หรือ GraphQL กับ field selection ที่ดี)                                 |

> **กฎทอง:** GraphQL เก่งที่ **composition สำหรับ client** — gRPC เก่งที่ **ประสิทธิภาพและ contract
> ระหว่างบริการ** หลายองค์กรใช้ทั้งคู่: GraphQL เป็น BFF / public edge และ gRPC เป็น internal RPC

---

## Best Practices ข้ามระดับ (สรุปเร็ว)

1. **ออกแบบ schema / proto เป็น contract ก่อนเขียนโค้ด** — version และ backward compatibility สำคัญ
2. **อย่าให้ GraphQL เป็น SQL ผ่าน HTTP** — จำกัด depth/cost และออกแบบ resolver ให้ batch ได้
3. **gRPC ใช้ HTTP/2 multiplexing** — reuse channel, อย่าเปิด connection ใหม่ทุก request
4. **แยก public surface กับ internal RPC** — gateway + auth ที่ edge, mTLS ระหว่างบริการ
5. **ทดสอบ failure path** — slow resolver, stream cancel, partial federation failure
