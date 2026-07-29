📍 **Nav:** [`🏠 Dev Learning Courses Hub`](https://github.com/worapha05/dev-learning-courses-hub/blob/main/README.md) | [`📂 API Design Courses Index`](../README.md) | 📝 [`Prompt File`](https://github.com/worapha05/ai-learning-prompts-hub/blob/main/course-generation/api-design-courses/basic-api-design-prompt.md)

---

# Zero to Expert: API Design Masterclass

หลักสูตรแบบครบวงจรสำหรับ Principal API Architect, Integration Engineer และ Backend Developer
ครอบคลุมปรัชญาการออกแบบ API, Strict REST, Advanced GraphQL Schema Design, Performance Tuning และ
Cross-paradigm Architectural Decisions

---

## โครงสร้างหลักสูตร

| ระดับ               | folder                                   | หัวข้อหลัก                                       | ระยะเวลาแนะนำ |
| ------------------- | ---------------------------------------- | ------------------------------------------------ | ------------- |
| **1. Beginner**     | [`01-beginner/`](./01-beginner/)         | API Paradigms & Resource Modeling                | 5–7 วัน       |
| **2. Intermediate** | [`02-intermediate/`](./02-intermediate/) | API Contracts, Schemas & Lifecycle Control       | 7–10 วัน      |
| **3. Expert**       | [`03-expert/`](./03-expert/)             | Performance, Security Hardening & Data Stitching | 10–14 วัน     |

แต่ละระดับประกอบด้วย:

1. **`README.md`** — ทฤษฎี, ปรัชญาการออกแบบ, เปรียบเทียบสถาปัตยกรรม และ Best Practices (ภาษาไทย)
2. **`src/` / `specs/` / `federation/`** — โค้ดตัวอย่าง OpenAPI, GraphQL SDL, Resolvers, DataLoader
   (TypeScript / Node.js)
3. **`LAB.md`** — โจทย์ Refactoring / Schema Design / Bottleneck พร้อมเฉลยครบถ้วน

---

## Prerequisites

- พื้นฐาน HTTP methods, status codes และ JSON
- Node.js ≥ 18 และ TypeScript พื้นฐาน
- ความเข้าใจเบื้องต้นเรื่อง Database (SQL หรือ NoSQL)
- เครื่องมือแนะนำ: `curl`, Insomnia/Postman, GraphiQL หรือ Apollo Sandbox

---

## ลำดับการเรียนที่แนะนำ

```
01-beginner → REST vs GraphQL + Resource Modeling
 ↓
02-intermediate → OpenAPI Contracts + Advanced SDL + Versioning
 ↓
03-expert → Caching, DataLoader, Security, Federation
```

**อย่าข้าม Lab** — แต่ละ Lab ออกแบบให้ยืนยันความเข้าใจก่อนขึ้นระดับถัดไป

---

## Quick Start

```bash
cd api-design-masterclass

# Beginner: REST + GraphQL foundations
cd 01-beginner/src
npm install
npx ts-node rest-server.ts
# อีก terminal: npx ts-node graphql-server.ts

# Intermediate: OpenAPI contract + advanced GraphQL
cd ../../02-intermediate
# เปิด specs/openapi-bookstore-v3.yaml ใน Swagger Editor
cd src && npm install && npx ts-node advanced-graphql-server.ts

# Expert: DataLoader + caching + federation concepts
cd ../../03-expert/src
npm install
npx ts-node dataloader-demo.ts
```

---

## Learning Outcomes

เมื่อจบหลักสูตร คุณจะสามารถ:

- [ ] อธิบายความแตกต่างเชิงปรัชญาของ REST (Resource-centric) กับ GraphQL (Query-centric)
- [ ] ออกแบบ Strict RESTful URI, HTTP methods, status codes และ query parameters อย่างถูกต้อง
- [ ] เขียน GraphQL Schema (Object, Input, Enum, Interface, Union) และ Resolvers ที่สะอาด
- [ ] ออกแบบ Contract-first API ด้วย OpenAPI v3 พร้อม reusable schemas และ auth
- [ ] เลือกกลยุทธ์ Versioning ของ REST และ Evolutionary model ของ GraphQL ได้อย่างเหมาะสม
- [ ] แก้ N+1 ด้วย DataLoader, จำกัด Query Depth/Complexity และตั้ง HTTP caching / ETag
- [ ] Hardening API ด้วย field-level auth, rate limiting และแนวคิด Apollo Federation / API Mesh

---

## Cross-paradigm Decision Matrix (สรุปเร็ว)

| เกณฑ์                                         | เลือก REST                    | เลือก GraphQL                    |
| --------------------------------------------- | ----------------------------- | -------------------------------- |
| Public / Partner API ที่ต้องการ cache ที่ CDN | ✅                            | ใช้เมื่อมี gateway ที่ดูแล cache |
| Client หลายรูปแบบต้องการ field ต่างกันมาก     | ต้อง BFF / multiple endpoints | ✅                               |
| Simple CRUD + มาตรฐาน HTTP ชัดเจน             | ✅                            | ได้ แต่ overhead สูงกว่า         |
| Real-time subscription / flexible query       | ทำได้ด้วย SSE/WS แยก          | ✅ ฝังใน schema                  |
| Strict contract + codegen จาก spec            | ✅ OpenAPI                    | ✅ SDL + codegen                 |

รายละเอียดเชิงลึกอยู่ในแต่ละระดับ
