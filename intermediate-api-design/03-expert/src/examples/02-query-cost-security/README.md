# 02 — Query Depth & Cost

```bash
node 03-expert/examples/02-query-cost-security/server.js
```

- Depth > 5 → validation error (ลอง `root { child { child { ... } } }`)
- Cost > 50 → `QUERY_TOO_EXPENSIVE`

ทดลอง query ที่ถูกปฏิเสธและที่ผ่าน แล้วปรับสูตร cost ให้เหมาะกับ domain ของคุณ
